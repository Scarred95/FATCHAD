// Original sample deck for FATCHAD prototype.
// Theme: faux-political/social satire in German. NOT copying any existing game.
// Hints: up | down | unknown
window.FATCHAD_CARDS = [
  // --- Tutorial-ish opener ---
  {
    id: "evt_tut_awakening",
    title: "Das Erwachen",
    description: "Du wachst auf einer Parkbank auf. Ein Praktikum-Anzug, klebriger Mund, ein Telefon mit 3% Akku. Eine fremde Nachricht: »Sei um neun im Büro. Du bist jetzt im Vorstand.«",
    art: "skyline",
    choices: [
      { text: "Hingehen. Zähne zusammen.", hints: { moneten: "up", aura: "down", respekt: "up" } },
      { text: "Bleiben. Tauben füttern.", hints: { aura: "up", moneten: "down", chaos: "up" } },
    ],
  },
  {
    id: "evt_minister",
    title: "Der korrupte Minister",
    description: "Ein Minister bietet dir Insider-Infos. »Nur ein kleiner Gefallen, Schatz. Wir sind doch unter uns.«",
    art: "smoke",
    choices: [
      { text: "Bezahlen.", hints: { moneten: "down", aura: "up", respekt: "up" } },
      { text: "Ihn bloßstellen.", hints: { respekt: "up", aura: "down", chaos: "unknown" } },
      { text: "Schweigen, ihn beobachten.", hints: { rizz: "up", chaos: "up" } },
    ],
  },
  {
    id: "evt_influencer",
    title: "Die Influencerin im Aufzug",
    description: "Sie filmt dich. »Sag was Krasses.« Drei Millionen Follower atmen mit.",
    art: "phone",
    choices: [
      { text: "Manifest in 7 Sekunden.", hints: { aura: "up", rizz: "up", respekt: "down" } },
      { text: "Höflich grüßen, aussteigen.", hints: { respekt: "up", aura: "down" } },
    ],
  },
  {
    id: "evt_bank",
    title: "Die Bankerin lächelt",
    description: "»Wir hätten da ein Produkt für Sie. Renditen wie Tinte. Risiken wie Nebel.«",
    art: "ledger",
    choices: [
      { text: "Voll rein.", hints: { moneten: "unknown", chaos: "up" } },
      { text: "Konservativ bleiben.", hints: { moneten: "up", aura: "down" } },
    ],
  },
  {
    id: "evt_demo",
    title: "Demo vor der Tür",
    description: "Sie skandieren deinen Namen. Es ist unklar, ob freundlich.",
    art: "crowd",
    choices: [
      { text: "Auf den Balkon, Rede halten.", hints: { aura: "up", respekt: "unknown", chaos: "up" } },
      { text: "Hintereingang, leise raus.", hints: { aura: "down", rizz: "down", respekt: "up" } },
    ],
  },
  {
    id: "evt_oldfriend",
    title: "Ein alter Freund",
    description: "Er war mal Idealist. Jetzt verkauft er Beratung. »Lass uns frühstücken. Du brauchst mich.«",
    art: "diner",
    choices: [
      { text: "Frühstücken.", hints: { rizz: "up", moneten: "down" } },
      { text: "Absagen. Zeit ist Geld.", hints: { moneten: "up", rizz: "down" } },
    ],
  },
  {
    id: "evt_press",
    title: "Die Presse fragt",
    description: "»Stimmt es, dass Sie...« — der Satz wird nie zu Ende kommen, egal was du antwortest.",
    art: "mic",
    choices: [
      { text: "Klar dementieren.", hints: { aura: "up", respekt: "down" } },
      { text: "Charmant ausweichen.", hints: { rizz: "up", aura: "unknown" } },
      { text: "Gegenfrage stellen.", hints: { respekt: "up", chaos: "up" } },
    ],
  },
  {
    id: "evt_party",
    title: "Empfang in der Botschaft",
    description: "Champagner-Glas Nummer drei. Jemand legt eine Hand auf deinen Rücken. »Wir sollten reden.«",
    art: "chandelier",
    choices: [
      { text: "Auf den Balkon mitgehen.", hints: { rizz: "up", chaos: "up", respekt: "down" } },
      { text: "Im Saal bleiben.", hints: { aura: "up", rizz: "down" } },
    ],
  },
  {
    id: "evt_intern",
    title: "Der Praktikant weiß zu viel",
    description: "Er hat ein Memo gefunden. »Soll ich das archivieren, oder...«",
    art: "folder",
    choices: [
      { text: "Beförderung. Sofort.", hints: { moneten: "down", respekt: "up", rizz: "up" } },
      { text: "Kündigen.", hints: { aura: "down", chaos: "up", respekt: "up" } },
    ],
  },
  {
    id: "evt_tax",
    title: "Brief vom Finanzamt",
    description: "Der Briefumschlag ist beige. Beige ist die Farbe der Angst.",
    art: "envelope",
    choices: [
      { text: "Öffnen.", hints: { moneten: "down", aura: "up" } },
      { text: "In die Schublade.", hints: { chaos: "up", moneten: "unknown" } },
    ],
  },
  {
    id: "evt_dog",
    title: "Der Hund des Kanzlers",
    description: "Er pinkelt auf deinen Schuh. Fotografen sind anwesend.",
    art: "dog",
    choices: [
      { text: "Lachen, streicheln.", hints: { aura: "up", rizz: "up" } },
      { text: "Stoisch ignorieren.", hints: { respekt: "up", aura: "down" } },
    ],
  },
  {
    id: "evt_phone",
    title: "Anruf um 3 Uhr morgens",
    description: "Unbekannte Nummer. Eine Stimme: »Sie wissen, warum ich anrufe.«",
    art: "phone-dark",
    choices: [
      { text: "Auflegen.", hints: { rizz: "down", chaos: "up" } },
      { text: "Zuhören.", hints: { respekt: "unknown", chaos: "up", aura: "down" } },
    ],
  },
  {
    id: "evt_startup",
    title: "Der Startup-Gründer pitcht",
    description: "»KI für Demokratie. Disruptiv. Wir brauchen nur Zugang zu deinen Daten.«",
    art: "laptop",
    choices: [
      { text: "Investieren.", hints: { moneten: "down", chaos: "up", rizz: "up" } },
      { text: "Höflich nein.", hints: { respekt: "up", aura: "down" } },
    ],
  },
  {
    id: "evt_speech",
    title: "Rede zur Lage",
    description: "Der Teleprompter ist ausgefallen. Die Kamera läuft. 14 Sekunden Stille.",
    art: "podium",
    choices: [
      { text: "Improvisieren.", hints: { aura: "unknown", rizz: "up", chaos: "up" } },
      { text: "Manuskript auspacken.", hints: { respekt: "up", aura: "down" } },
    ],
  },
  {
    id: "evt_scandal",
    title: "Ein Foto kursiert",
    description: "Du bist drauf. Vielleicht. Es könnte auch jemand anders sein. Die Auflösung ist niedrig genug für Hoffnung.",
    art: "polaroid",
    choices: [
      { text: "Anwalt anrufen.", hints: { moneten: "down", respekt: "up" } },
      { text: "Selbst dazu stehen.", hints: { aura: "up", respekt: "down", rizz: "up" } },
      { text: "Schweigen, hoffen.", hints: { chaos: "up", aura: "down" } },
    ],
  },
];

// Endings catalogue
window.FATCHAD_ENDINGS = {
  chaos_agent:           { label: "Chaos Agent",          flavor: "Du hast das System zerlegt. Jetzt baut sich was Neues drauf. Vielleicht.", tone: "win" },
  grey_eminence:         { label: "Graue Eminenz",        flavor: "Niemand kennt deinen Namen. Alle befolgen deine Anweisungen.",            tone: "win" },
  death_bankrupt:        { label: "Pleite",               flavor: "Die Tankstelle nimmt deine Karte nicht mehr.",                          tone: "loss" },
  death_revolution:      { label: "Revolution",           flavor: "Zu reich, zu schnell, zu sichtbar. Die Straße holt sich's zurück.",    tone: "loss" },
  death_irrelevant:      { label: "Vergessen",            flavor: "Dein Wikipedia-Artikel wurde zur Löschung vorgeschlagen.",             tone: "loss" },
  death_jumped_shark:    { label: "Overexposed",          flavor: "Du bist überall. Niemand schaut mehr hin.",                            tone: "loss" },
  death_couped:          { label: "Gestürzt",             flavor: "Sie haben dich aus dem Fenster begleitet. Höflich.",                   tone: "loss" },
  death_conspiracy:      { label: "Verschwörung",         flavor: "Zu viel Macht, zu sichtbar konzentriert. Sie haben sich verbündet.",   tone: "loss" },
  death_frozen_out:      { label: "Eingefroren",          flavor: "Anrufe gehen ins Leere. Tische sind plötzlich besetzt.",               tone: "loss" },
  death_drowned_in_drama:{ label: "Im Drama ertrunken",   flavor: "Jede Schlagzeile war über dich. Keine war wahr. Es spielte keine Rolle.", tone: "loss" },
  softlock_no_cards:     { label: "Stille",               flavor: "Es passiert einfach nichts mehr.",                                     tone: "loss" },
};
