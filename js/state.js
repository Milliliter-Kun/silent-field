// 刷新即重置；复制初始消息，不改写内容数据。
window.createSessionMessages = chat => chat.messages.map((message, index) => ({
  ...message, id: message.id || `history-${chat.id}-${index}`
}));
window.chatSession = {
  chats: window.chatPreviewData.map(chat => ({ ...chat, messages: window.createSessionMessages(chat).filter(message =>
    chat.id !== "ding" || (message.date || chat.date) >= "2026-09-01") })),
  calibration: { guiOpen: false, target: null, records: [], requiredCount: 4,
    phase: "idle", error: "", masks: {}, keywords: [], replacements: {}, validated: false },
  botBusy: false,
  songEggUsed: false,
  botGeneration: 0,
  ending: { phase: "idle", locked: false, typing: false, waiting: false, round: 0 },
  unread: {},
  calibratedMembers: {},
  calibratedMessages: {},
  restoredMembers: { ding: false },
  restoringMembers: [],
  currentId: null,
  openRecordSetId: null,
  drafts: new Map(),
  scrollPositions: new Map(),
  historySync: Object.fromEntries(window.chatPreviewData.map(chat => [chat.id, "idle"])),
  commandHistory: [],
  historyCursor: 0,
  draftBeforeHistory: "",
  nextMessageId: 1,
  clock: { date: "2026-09-03", lastMinuteOfDay: null }
};

window.nextMessageTimestamp = (now = new Date()) => {
  const clock = window.chatSession.clock;
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  // 只比较运行中新消息的时分；旧历史不参与跨日判断。
  if (clock.lastMinuteOfDay !== null && minuteOfDay < clock.lastMinuteOfDay) {
    const date = new Date(`${clock.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    clock.date = date.toISOString().slice(0, 10);
  }
  clock.lastMinuteOfDay = minuteOfDay;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return { date: clock.date, time };
};
