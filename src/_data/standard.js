// Summeringspanelens utgångsläge, räknat med samma logik som webbläsaren
// använder. Gör att panelen visar rätt även om besökaren har JS avstängt.
const Konfigurator = require('../../assets/konfigurator.js');

module.exports = {
  ...Konfigurator.sammanfatta(Konfigurator.DEFINITIONER.standard),
  belopp: Konfigurator.berakna(Konfigurator.DEFINITIONER.standard)
};
