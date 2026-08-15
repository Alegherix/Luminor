export type PrototypeActionPoint = {
  readonly id: string;
  readonly text: string;
  readonly owner: string;
  readonly dueDate: string;
  readonly mentionedAt: string;
};

export type PrototypeMeetingOverview = {
  readonly summary: readonly string[];
  readonly decisions: readonly string[];
  readonly actionPoints: readonly PrototypeActionPoint[];
};

export type PrototypeTranscriptSegment = {
  readonly time: string;
  readonly speaker: string;
  readonly text: string;
};

export type PrototypeMeetingSection = "live" | "today" | "previous";

export type PrototypeMeeting = {
  readonly id: string;
  readonly title: string;
  readonly section: PrototypeMeetingSection;
  readonly when: string;
  readonly timeRange: string;
  readonly attendees: readonly string[];
  readonly processed: boolean;
  readonly live?: boolean;
  readonly countdownLabel?: string;
  readonly overview: PrototypeMeetingOverview | null;
  readonly transcript: readonly PrototypeTranscriptSegment[];
  readonly notes: string | null;
};

const ORION_ACTION_POINTS: readonly PrototypeActionPoint[] = [
  {
    id: "orion-ap-1",
    text: "Ta fram förslag på informationsarkitektur",
    owner: "Emma L.",
    dueDate: "22 aug 2026",
    mentionedAt: "14:07",
  },
  {
    id: "orion-ap-2",
    text: "Sätta upp QA-miljö och tillgångar",
    owner: "Johan K.",
    dueDate: "20 aug 2026",
    mentionedAt: "18:23",
  },
  {
    id: "orion-ap-3",
    text: "Dela tidsplan i Confluence och samla feedback",
    owner: "Sara P.",
    dueDate: "18 aug 2026",
    mentionedAt: "22:11",
  },
  {
    id: "orion-ap-4",
    text: "Boka in design review v. 34",
    owner: "Marcus H.",
    dueDate: "19 aug 2026",
    mentionedAt: "34:52",
  },
  {
    id: "orion-ap-5",
    text: "Förbereda risklista och mitigeringar",
    owner: "Emma L.",
    dueDate: "21 aug 2026",
    mentionedAt: "48:06",
  },
  {
    id: "orion-ap-6",
    text: "Stämma av beroenden med plattformsteamet",
    owner: "Johan K.",
    dueDate: "25 aug 2026",
    mentionedAt: "1:02:17",
  },
  {
    id: "orion-ap-7",
    text: "Skissa onboarding-flöde för modul 1",
    owner: "Sara P.",
    dueDate: "26 aug 2026",
    mentionedAt: "1:05:40",
  },
  {
    id: "orion-ap-8",
    text: "Definiera mätpunkter för MVP-lansering",
    owner: "Marcus H.",
    dueDate: "28 aug 2026",
    mentionedAt: "1:11:03",
  },
];

const ORION_TRANSCRIPT: readonly PrototypeTranscriptSegment[] = [
  {
    time: "00:12",
    speaker: "Emma L.",
    text: "Välkomna till kickoffen för Orion. Målet idag är att vi lämnar rummet med en gemensam bild av leveranserna för Q3 och Q4.",
  },
  {
    time: "02:45",
    speaker: "Johan K.",
    text: "Innan vi går in på tidsplanen vill jag flagga att QA-miljön inte är på plats än. Det blockerar integrationstesterna.",
  },
  {
    time: "14:07",
    speaker: "Emma L.",
    text: "Jag tar på mig att ta fram ett förslag på informationsarkitekturen till nästa vecka, så har vi något konkret att reagera på.",
  },
  {
    time: "18:23",
    speaker: "Johan K.",
    text: "Då sätter jag upp QA-miljön och ser till att tillgångarna finns där senast den tjugonde.",
  },
  {
    time: "22:11",
    speaker: "Sara P.",
    text: "Jag delar tidsplanen i Confluence direkt efter mötet och samlar feedback asynkront fram till på måndag.",
  },
  {
    time: "34:52",
    speaker: "Marcus H.",
    text: "Vi behöver en design review innan modul 1 låses. Jag bokar in den vecka 34.",
  },
  {
    time: "48:06",
    speaker: "Emma L.",
    text: "Risklistan är tunn just nu. Jag förbereder en ordentlig genomgång med mitigeringar till nästa avstämning.",
  },
  {
    time: "1:02:17",
    speaker: "Johan K.",
    text: "Beroendena mot plattformsteamet är fortfarande oklara, framför allt kring autentiseringen. Jag stämmer av med dem.",
  },
  {
    time: "1:05:40",
    speaker: "Sara P.",
    text: "Onboarding-flödet för modul 1 saknar skisser. Jag tar fram ett första utkast.",
  },
  {
    time: "1:11:03",
    speaker: "Marcus H.",
    text: "Sista punkten: vi behöver mätpunkter för MVP-lanseringen så att vi vet om vi lyckats. Jag definierar ett förslag.",
  },
  {
    time: "1:24:30",
    speaker: "Emma L.",
    text: "Bra möte allihop. Vi kör veckovisa avstämningar måndagar nio och följer upp åtgärdspunkterna där.",
  },
];

export const PROTOTYPE_MEETINGS: readonly PrototypeMeeting[] = [
  {
    id: "veckostatus-live",
    title: "Veckostatus – Produkt",
    section: "live",
    when: "Pågår nu",
    timeRange: "08:30 – 09:15",
    attendees: ["Emma L.", "Johan K.", "Sara P.", "Marcus H.", "Lina Ö.", "David N.", "Amir S."],
    processed: false,
    live: true,
    countdownLabel: "Live now",
    overview: null,
    transcript: [],
    notes: null,
  },
  {
    id: "planering-q3-idag",
    title: "Planering Q3",
    section: "today",
    when: "Idag",
    timeRange: "13:00 – 14:00",
    attendees: ["Emma L.", "Johan K.", "Sara P.", "Marcus H.", "Lina Ö.", "David N."],
    processed: false,
    countdownLabel: "Starts in 2 hr",
    overview: null,
    transcript: [],
    notes: null,
  },
  {
    id: "design-review-idag",
    title: "Design review",
    section: "today",
    when: "Idag",
    timeRange: "10:00 – 10:45",
    attendees: ["Sara P.", "Marcus H.", "Lina Ö.", "Petra W."],
    processed: false,
    countdownLabel: "Ended",
    overview: null,
    transcript: [],
    notes: null,
  },
  {
    id: "orion-kickoff",
    title: "Projekt Kickoff – Orion",
    section: "previous",
    when: "Igår",
    timeRange: "14:00 – 15:30",
    attendees: [
      "Emma L.",
      "Johan K.",
      "Sara P.",
      "Marcus H.",
      "Lina Ö.",
      "David N.",
      "Amir S.",
      "Petra W.",
    ],
    processed: true,
    overview: {
      summary: [
        "Mötet var en projektkickoff för Orion med fokus på målbild, leveranser och roller.",
        "Vi gick igenom tidsplanen för Q3–Q4, identifierade beroenden och beslutade om nästa steg.",
        "Teamet är samlat kring prioriteringarna och kommunikationen framåt.",
      ],
      decisions: [
        "Vi kör MVP med modul 1 och 2 i Q3.",
        "Designsystemet blir vårt gemensamma språk.",
        "Veckovisa avstämningar varje måndag kl. 09:00.",
      ],
      actionPoints: ORION_ACTION_POINTS,
    },
    transcript: ORION_TRANSCRIPT,
    notes: [
      "Kolla upp om plattformsteamet redan har en lösning för SSO innan Johan börjar.",
      "",
      "Marcus verkade tveksam till tidsplanen för modul 2 – följ upp enskilt.",
      "",
      "Idé: låta designsystemet driva komponentbiblioteket från dag ett istället för att migrera senare.",
    ].join("\n"),
  },
  {
    id: "retro-sprint-24",
    title: "Retrospektiv Sprint 24",
    section: "previous",
    when: "1 jun",
    timeRange: "10:00 – 11:00",
    attendees: ["Emma L.", "Johan K.", "Sara P.", "Marcus H.", "David N.", "Amir S."],
    processed: true,
    overview: {
      summary: [
        "Retrospektiv för sprint 24 med fokus på flödet mellan design och utveckling.",
        "Överlämningarna tar för lång tid och testtäckningen släpar efter.",
      ],
      decisions: [
        "Design och utveckling parar ihop sig vid överlämning.",
        "Definition of done utökas med testtäckning.",
      ],
      actionPoints: [
        {
          id: "retro-ap-1",
          text: "Uppdatera definition of done i teamhandboken",
          owner: "Sara P.",
          dueDate: "5 jun 2026",
          mentionedAt: "12:40",
        },
        {
          id: "retro-ap-2",
          text: "Boka parningssessioner för nästa sprint",
          owner: "Emma L.",
          dueDate: "3 jun 2026",
          mentionedAt: "31:15",
        },
      ],
    },
    transcript: [
      {
        time: "12:40",
        speaker: "Sara P.",
        text: "Definition of done behöver uppdateras med testtäckning, jag tar det.",
      },
      {
        time: "31:15",
        speaker: "Emma L.",
        text: "Jag bokar parningssessionerna för nästa sprint.",
      },
    ],
    notes: null,
  },
  {
    id: "kundmote-northwind",
    title: "Kundmöte – Northwind AB",
    section: "previous",
    when: "30 maj",
    timeRange: "13:00 – 14:00",
    attendees: ["Marcus H.", "Emma L.", "Anders B.", "Karin F.", "Ola T."],
    processed: true,
    overview: {
      summary: [
        "Uppföljningsmöte med Northwind om piloten och nästa avtalsperiod.",
        "Kunden är nöjd med piloten men vill se bättre rapportering.",
      ],
      decisions: ["Piloten förlängs till sista september.", "Rapportmodulen prioriteras upp."],
      actionPoints: [
        {
          id: "northwind-ap-1",
          text: "Skicka förslag på rapportmodulens omfattning",
          owner: "Marcus H.",
          dueDate: "5 jun 2026",
          mentionedAt: "24:02",
        },
      ],
    },
    transcript: [
      {
        time: "24:02",
        speaker: "Marcus H.",
        text: "Jag skickar ett förslag på vad rapportmodulen skulle omfatta.",
      },
    ],
    notes: "Northwind nämnde att deras CFO vill ha exporter till Excel – inte lovat något.",
  },
  {
    id: "arkitekturgenomgang",
    title: "Arkitekturgenomgång",
    section: "previous",
    when: "28 maj",
    timeRange: "09:00 – 10:30",
    attendees: ["Johan K.", "David N.", "Amir S.", "Lina Ö."],
    processed: true,
    overview: {
      summary: ["Genomgång av målarkitekturen inför Orion med fokus på integrationslagret."],
      decisions: ["Eventdriven integration väljs framför direktanrop."],
      actionPoints: [
        {
          id: "arkitektur-ap-1",
          text: "Dokumentera eventkontrakt för integrationslagret",
          owner: "Johan K.",
          dueDate: "2 jun 2026",
          mentionedAt: "41:19",
        },
      ],
    },
    transcript: [
      {
        time: "41:19",
        speaker: "Johan K.",
        text: "Jag dokumenterar eventkontrakten så att alla team bygger mot samma sak.",
      },
    ],
    notes: null,
  },
  {
    id: "budgetgenomgang",
    title: "Budgetgenomgång",
    section: "previous",
    when: "27 maj",
    timeRange: "15:00 – 16:00",
    attendees: ["Emma L.", "Petra W.", "Anders B."],
    processed: true,
    overview: {
      summary: ["Budgetläget för H2 gicks igenom. Utrymme finns för en extra konsult under Q3."],
      decisions: ["Konsultbudgeten för Q3 godkänns."],
      actionPoints: [
        {
          id: "budget-ap-1",
          text: "Starta rekrytering av Q3-konsult",
          owner: "Emma L.",
          dueDate: "10 jun 2026",
          mentionedAt: "18:55",
        },
      ],
    },
    transcript: [
      {
        time: "18:55",
        speaker: "Emma L.",
        text: "Då startar jag rekryteringen av konsulten direkt.",
      },
    ],
    notes: null,
  },
  {
    id: "planering-q3-maj",
    title: "Planering Q3",
    section: "previous",
    when: "26 maj",
    timeRange: "13:00 – 14:00",
    attendees: ["Emma L.", "Johan K.", "Sara P.", "Marcus H.", "Lina Ö.", "David N."],
    processed: false,
    overview: null,
    transcript: [
      {
        time: "05:30",
        speaker: "Sara P.",
        text: "Vi börjar med att gå igenom kapaciteten per team.",
      },
    ],
    notes: null,
  },
];

export function actionPointClipboardText(points: readonly PrototypeActionPoint[]): string {
  return points
    .map((point) => `- [ ] ${point.text} — ${point.owner}, senast ${point.dueDate}`)
    .join("\n");
}

export function actionPointThreadPrompt(
  meeting: Pick<PrototypeMeeting, "title" | "when">,
  points: readonly PrototypeActionPoint[],
): string {
  const list = points.map((point) => `- ${point.text} (ansvarig: ${point.owner})`).join("\n");
  return `Från mötet "${meeting.title}" (${meeting.when}) har jag följande åtgärdspunkter:\n\n${list}\n\nHjälp mig planera och genomföra dem.`;
}

export function meetingHasReview(
  meeting: Pick<PrototypeMeeting, "overview" | "transcript" | "notes">,
): boolean {
  return meeting.overview !== null || meeting.transcript.length > 0 || meeting.notes !== null;
}

export function filterPreviousMeetings(
  meetings: readonly PrototypeMeeting[],
  query: string,
): readonly PrototypeMeeting[] {
  const previous = meetings.filter((meeting) => meeting.section === "previous");
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return previous;
  }
  return previous.filter((meeting) => meeting.title.toLowerCase().includes(normalized));
}
