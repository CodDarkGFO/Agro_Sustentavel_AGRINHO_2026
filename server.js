const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const HTTP_PORT = Number(process.env.PORT || 3000);
const SERIAL_PORT_ENV = process.env.SERIAL_PORT || "";
const BAUD_RATE = Number(process.env.BAUD_RATE || 9600);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(__dirname));

let serialPort = null;
let parser = null;
let openingSerial = false;

let pumpState = { p1: 0, p2: 0, p3: 0 };

let serialStatus = {
  connected: false,
  port: "",
  message: "Servidor iniciado. Arduino ainda não conectado."
};

function broadcast(payload) {
  const message = JSON.stringify(payload);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function currentPayload(extra = {}) {
  return {
    state: pumpState,
    serial: serialStatus,
    ...extra
  };
}

function setSerialStatus(connected, message, port = "") {
  serialStatus = { connected, message, port };
  broadcast(currentPayload());
}

function parseArduinoLine(line) {
  const cleanLine = String(line || "").trim();
  if (!cleanLine) return;

  console.log("[ARDUINO]", cleanLine);

  if (cleanLine.startsWith("{")) {
    try {
      const data = JSON.parse(cleanLine);
      pumpState = {
        p1: Number(data.p1) === 1 ? 1 : 0,
        p2: Number(data.p2) === 1 ? 1 : 0,
        p3: Number(data.p3) === 1 ? 1 : 0
      };

      broadcast(currentPayload({
        message: `Retorno do Arduino: ${cleanLine}`
      }));
      return;
    } catch (error) {
      broadcast(currentPayload({
        message: `Erro ao interpretar JSON do Arduino: ${cleanLine}`
      }));
      return;
    }
  }

  broadcast(currentPayload({ message: cleanLine }));
}

async function findSerialPort() {
  if (SERIAL_PORT_ENV) return SERIAL_PORT_ENV;

  const ports = await SerialPort.list();

  if (!ports.length) {
    throw new Error("Nenhuma porta serial encontrada. Conecte o Arduino via USB.");
  }

  const arduinoPort = ports.find((port) => {
    const text = `${port.path} ${port.manufacturer || ""} ${port.friendlyName || ""} ${port.vendorId || ""}`.toLowerCase();
    return (
      text.includes("arduino") ||
      text.includes("ch340") ||
      text.includes("wch") ||
      text.includes("usb-serial") ||
      text.includes("usb serial") ||
      text.includes("silicon labs") ||
      text.includes("cp210") ||
      text.includes("ftdi")
    );
  });

  return (arduinoPort || ports[0]).path;
}

async function openArduinoSerial() {
  if (serialPort && serialPort.isOpen) {
    return currentPayload({
      message: `Arduino já conectado em ${serialStatus.port}.`
    });
  }

  if (openingSerial) {
    return currentPayload({
      message: "Abertura da porta serial já está em andamento."
    });
  }

  openingSerial = true;

  try {
    const portPath = await findSerialPort();

    serialPort = new SerialPort({
      path: portPath,
      baudRate: BAUD_RATE,
      autoOpen: false
    });

    await new Promise((resolve, reject) => {
      serialPort.open((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: "\n" }));
    parser.on("data", parseArduinoLine);

    serialPort.on("error", (error) => {
      console.error("[SERIAL ERRO]", error.message);
      setSerialStatus(false, `Erro na porta serial: ${error.message}`, portPath);
    });

    serialPort.on("close", () => {
      console.log("[SERIAL] Porta fechada.");
      setSerialStatus(false, "Porta serial fechada. Conecte novamente pelo painel.", portPath);
    });

    setSerialStatus(true, "Arduino conectado ao servidor", portPath);

    // O Arduino Uno reinicia ao abrir a porta serial. Aguardar antes de pedir status.
    setTimeout(() => {
      writeCommand("STATUS").catch((error) => {
        setSerialStatus(false, `Falha ao solicitar STATUS: ${error.message}`, portPath);
      });
    }, 2000);

    return currentPayload({
      message: `Arduino conectado em ${portPath}.`
    });
  } finally {
    openingSerial = false;
  }
}

async function writeCommand(command) {
  if (!serialPort || !serialPort.isOpen) {
    throw new Error("Arduino não está conectado ao servidor. Clique em CONECTAR ARDUINO.");
  }

  const cleanCommand = String(command).trim().toUpperCase();

  await new Promise((resolve, reject) => {
    serialPort.write(`${cleanCommand}\n`, (error) => {
      if (error) reject(error);
      else serialPort.drain(resolve);
    });
  });

  // Atualização otimista para deixar a interface do celular imediata.
  const pumpMatch = cleanCommand.match(/^P([1-3])=(0|1)$/);
  if (pumpMatch) {
    pumpState[`p${pumpMatch[1]}`] = Number(pumpMatch[2]);
  }

  if (cleanCommand === "ALL=0" || cleanCommand === "TODOS=0") {
    pumpState = { p1: 0, p2: 0, p3: 0 };
  }

  broadcast(currentPayload({
    message: `Comando enviado ao Arduino: ${cleanCommand}`
  }));

  return currentPayload({
    message: `Comando enviado ao Arduino: ${cleanCommand}`
  });
}

app.get("/api/status", (req, res) => {
  res.json(currentPayload());
});

app.get("/api/ports", async (req, res) => {
  try {
    const ports = await SerialPort.list();
    res.json({ ports });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/connect", async (req, res) => {
  try {
    const payload = await openArduinoSerial();
    res.json(payload);
  } catch (error) {
    setSerialStatus(false, error.message);
    res.status(500).json(currentPayload({ error: error.message }));
  }
});

app.post("/api/pump/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (![1, 2, 3].includes(id)) {
      return res.status(400).json({ error: "Número de bomba inválido." });
    }

    const active = Boolean(req.body.active);
    const payload = await writeCommand(`P${id}=${active ? 1 : 0}`);
    res.json(payload);
  } catch (error) {
    res.status(500).json(currentPayload({ error: error.message }));
  }
});

app.post("/api/all-off", async (req, res) => {
  try {
    const payload = await writeCommand("ALL=0");
    res.json(payload);
  } catch (error) {
    res.status(500).json(currentPayload({ error: error.message }));
  }
});

app.post("/api/command", async (req, res) => {
  try {
    const command = req.body.command;
    if (!command) {
      return res.status(400).json({ error: "Comando não informado." });
    }

    const payload = await writeCommand(command);
    res.json(payload);
  } catch (error) {
    res.status(500).json(currentPayload({ error: error.message }));
  }
});

wss.on("connection", (socket) => {
  socket.send(JSON.stringify(currentPayload({
    message: "Dispositivo conectado ao servidor."
  })));
});

function getLocalAddresses() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }

  return results;
}

server.listen(HTTP_PORT, "0.0.0.0", async () => {
  console.log("==================================================");
  console.log(" PAINEL SUPERVISÓRIO - SERVIDOR LOCAL");
  console.log("==================================================");
  console.log(`Computador: http://localhost:${HTTP_PORT}`);
  getLocalAddresses().forEach((ip) => {
    console.log(`Celular na mesma rede Wi-Fi: http://${ip}:${HTTP_PORT}`);
  });
  console.log("--------------------------------------------------");
  console.log("Tentando conectar ao Arduino automaticamente...");
  console.log("Se necessário, informe a porta:");
  console.log("Windows PowerShell:  $env:SERIAL_PORT=\"COM3\"; npm start");
  console.log("Windows CMD:         set SERIAL_PORT=COM3 && npm start");
  console.log("Linux/macOS:         SERIAL_PORT=/dev/ttyUSB0 npm start");
  console.log("==================================================");

  try {
    await openArduinoSerial();
  } catch (error) {
    console.log(`[AVISO] ${error.message}`);
    setSerialStatus(false, error.message);
  }
});
