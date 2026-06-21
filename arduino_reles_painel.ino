/*
  PROJETO: Painel de Automação Industrial com Arduino Uno R3
  Função: controlar 3 relés por comandos seriais recebidos do servidor Node.js.
  O computador fica conectado ao Arduino via USB e disponibiliza a página para o celular.

  COMANDOS RECEBIDOS PELO SERVIDOR:
  P1=1    -> Liga relé 1 e LED verde 1
  P1=0    -> Desliga relé 1 e LED verde 1
  P2=1    -> Liga relé 2 e LED verde 2
  P2=0    -> Desliga relé 2 e LED verde 2
  P3=1    -> Liga relé 3 e LED verde 3
  P3=0    -> Desliga relé 3 e LED verde 3
  ALL=0   -> Desliga todos os relés e LEDs
  STATUS  -> Envia o estado atual para a página

  RETORNO ENVIADO PARA A PÁGINA:
  {"p1":0,"p2":1,"p3":0}

  ATENÇÃO:
  - Muitos módulos de relé 5V são acionados em nível BAIXO.
  - Se o seu módulo acionar invertido, altere RELE_ATIVO_EM_NIVEL_BAIXO para false.
  - Para cargas AC, como bombas em 127V/220V, faça a ligação com proteção,
    fusível/disjuntor e isolamento adequado.
*/

const byte QUANTIDADE_BOMBAS = 3;

// Pinos dos relés
const byte pinosRele[QUANTIDADE_BOMBAS] = {8, 7, 6};

// Pinos dos LEDs verdes
const byte pinosLedVermelho[QUANTIDADE_BOMBAS] = {10, 11, 12};

// true = módulo de relé aciona com LOW, comum em módulos de relé Arduino.
// false = módulo de relé aciona com HIGH.
const bool RELE_ATIVO_EM_NIVEL_BAIXO = true;

bool estadoBomba[QUANTIDADE_BOMBAS] = {false, false, false};

//Led Status de Ligado/desligado
#define ledVerd 9


void setup() {
  Serial.begin(9600);
  pinMode(ledVerd, OUTPUT);
  

  for (byte i = 0; i < QUANTIDADE_BOMBAS; i++) {
    pinMode(pinosRele[i], OUTPUT);
    pinMode(pinosLedVermelho[i], OUTPUT);
    definirBomba(i, false);
  }

  delay(300);
  Serial.println("READY - Arduino Uno R3 conectado ao painel.");
  enviarStatus();

}

void loop() {
  digitalWrite(ledVerd, HIGH);
  if (Serial.available() > 0) {
    String comando = Serial.readStringUntil('\n');
    comando.trim();
    comando.toUpperCase();

    if (comando.length() > 0) {
      processarComando(comando);
    }
  }
}

void definirBomba(byte indice, bool ligar) {
  if (indice >= QUANTIDADE_BOMBAS) return;

  estadoBomba[indice] = ligar;

  byte nivelRele;
  if (RELE_ATIVO_EM_NIVEL_BAIXO) {
    nivelRele = ligar ? LOW : HIGH;
  } else {
    nivelRele = ligar ? HIGH : LOW;
  }

  digitalWrite(pinosRele[indice], nivelRele);
  digitalWrite(pinosLedVermelho[indice], ligar ? HIGH : LOW);

}

void processarComando(String comando) {
  if (comando == "STATUS") {
    enviarStatus();
    return;
  }

  if (comando == "ALL=0" || comando == "TODOS=0") {
    for (byte i = 0; i < QUANTIDADE_BOMBAS; i++) {
      definirBomba(i, false);
    }
    enviarStatus();
    return;
  }

  int posIgual = comando.indexOf('=');

  if (comando.startsWith("P") && posIgual > 1) {
    int numeroBomba = comando.substring(1, posIgual).toInt();
    String valor = comando.substring(posIgual + 1);

    if (numeroBomba >= 1 && numeroBomba <= QUANTIDADE_BOMBAS) {
      bool ligar = (valor == "1" || valor == "ON" || valor == "LIGAR");
      definirBomba(numeroBomba - 1, ligar);
      enviarStatus();
    } else {
      Serial.println("ERRO - Numero de bomba invalido.");
    }
    return;
  }

  Serial.print("ERRO - Comando desconhecido: ");
  Serial.println(comando);
}

void enviarStatus() {
  Serial.print("{\"p1\":");
  Serial.print(estadoBomba[0] ? 1 : 0);
  Serial.print(",\"p2\":");
  Serial.print(estadoBomba[1] ? 1 : 0);
  Serial.print(",\"p3\":");
  Serial.print(estadoBomba[2] ? 1 : 0);
  Serial.println("}");
}
