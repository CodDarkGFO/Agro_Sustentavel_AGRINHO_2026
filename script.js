const pumpCards = [...document.querySelectorAll(".pump-card")];
const activeCount = document.getElementById("activeCount");
const systemClock = document.getElementById("systemClock");
const connectArduinoButton = document.getElementById("connectArduino");
const turnOffAllButton = document.getElementById("turnOffAll");
const connectionStatus = document.getElementById("connectionStatus");
const connectionLed = document.getElementById("connectionLed");
const serialMessage = document.getElementById("serialMessage");

let socket = null;
let servidorOnline = false;
let arduinoConnected = false;

function formatTime(date) {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function updateClocks() {
  const now = new Date();
  const currentTime = formatTime(now);

  systemClock.textContent = currentTime;

  document.querySelectorAll(".display-clock").forEach((clock) => {
    clock.textContent = currentTime;
  });
}

function updateSummary() {
  const enabledPumps = document.querySelectorAll(".pump-card.active").length;
  activeCount.textContent = `${enabledPumps} / ${pumpCards.length}`;
}

function updateConnectionStatus(connected, message = "", portName = "") {
  arduinoConnected = connected;
  connectionStatus.textContent = connected ? "CONECTADO" : "DESCONECTADO";
  connectArduinoButton.textContent = connected ? "ARDUINO CONECTADO" : "CONECTAR ARDUINO";
  connectionLed.classList.toggle("disconnected", !connected);

  if (message) {
    serialMessage.textContent = portName ? `${message} (${portName})` : message;
    return;
  }

  serialMessage.textContent = connected
    ? "Arduino conectado ao servidor. O celular já pode acionar os relés."
    : "Servidor ativo, mas Arduino ainda não conectado.";
}

function updatePumpUI(pumpNumber, isActive) {
  const card = document.querySelector(`.pump-card[data-pump="${pumpNumber}"]`);
  if (!card) return;

  const button = card.querySelector(".push-button");
  const badge = card.querySelector(".status-badge");
  const displayState = card.querySelector(".display-state");

  card.classList.toggle("active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
  badge.textContent = isActive ? "LIGADA" : "DESLIGADA";
  displayState.textContent = isActive ? "EM OPERAÇÃO" : "PARADA";

  updateSummary();
}

function applyArduinoState(state) {
  if (typeof state.p1 !== "undefined") updatePumpUI(1, Number(state.p1) === 1);
  if (typeof state.p2 !== "undefined") updatePumpUI(2, Number(state.p2) === 1);
  if (typeof state.p3 !== "undefined") updatePumpUI(3, Number(state.p3) === 1);
}

function applyServerPayload(payload) {
  if (!payload) return;

  if (payload.state) {
    applyArduinoState(payload.state);
  }

  if (payload.serial) {
    updateConnectionStatus(
      Boolean(payload.serial.connected),
      payload.serial.message || "",
      payload.serial.port || ""
    );
  }

  if (payload.message && !payload.serial) {
    serialMessage.textContent = payload.message;
  }
}

async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Falha ao comunicar com o servidor.");
  }

  return payload;
}

async function loadInitialStatus() {
  try {
    const response = await fetch("/api/status");
    const payload = await response.json();
    servidorOnline = true;
    applyServerPayload(payload);
  } catch (error) {
    servidorOnline = false;
    updateConnectionStatus(false, "Servidor offline. Abra a página pelo endereço do computador servidor.");
  }
}

function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}`);

  socket.addEventListener("open", () => {
    servidorOnline = true;
    serialMessage.textContent = "Celular conectado ao servidor do painel.";
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      applyServerPayload(payload);
    } catch (error) {
      console.warn("Mensagem WebSocket inválida:", event.data);
    }
  });

  socket.addEventListener("close", () => {
    servidorOnline = false;
    updateConnectionStatus(false, "Conexão com o servidor perdida. Verifique o Wi-Fi e o computador servidor.");
    setTimeout(connectWebSocket, 2500);
  });
}

pumpCards.forEach((card) => {
  const button = card.querySelector(".push-button");
  const pumpNumber = Number(card.dataset.pump);

  button.addEventListener("click", async () => {
    const isActive = card.classList.contains("active");
    const nextState = !isActive;

    try {
      const payload = await postJson(`/api/pump/${pumpNumber}`, { active: nextState });
      applyServerPayload(payload);
    } catch (error) {
      alert(error.message);
    }
  });
});

connectArduinoButton.addEventListener("click", async () => {
  try {
    const payload = await postJson("/api/connect");
    applyServerPayload(payload);
  } catch (error) {
    alert(error.message);
  }
});

turnOffAllButton.addEventListener("click", async () => {
  try {
    const payload = await postJson("/api/all-off");
    applyServerPayload(payload);
  } catch (error) {
    alert(error.message);
  }
});

updateClocks();
updateSummary();
updateConnectionStatus(false, "Conectando ao servidor local...");
setInterval(updateClocks, 1000);
loadInitialStatus();
connectWebSocket();
