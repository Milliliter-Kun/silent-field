// delayMs 为 null 时使用默认延迟；单位毫秒，可逐条覆盖，如 4000。
window.endingDialogue = {
  defaultDelayMs: 2400,
  reactionDelayMs: 800, // 读完主角消息后，再显示正在输入；不抵扣回复延迟。
  rounds: [
    { player: "？", ding: [{ text: "咋还打了电话", delayMs: null }, { text: "什么情况", delayMs: null }] },
    { player: "我还想问你", ding: [] },
    { player: "失联一整天是咋回事", ding: [] },
    { player: "群里也完全没人", ding: [] },
    { player: "诡异得没边了", ding: [
      { text: "一整天？", delayMs: null },
      { text: "我吃完烧烤就", delayMs: null },
      { text: "怪了", delayMs: 3600 },
      { text: "本来想说吃完烧烤就回家了", delayMs: null },
      { text: "但完全想不起来干了啥", delayMs: null }
    ] },
    { player: "今天都3号了", ding: [
      { text: "群里还真没人回话", delayMs: null },
      { text: "卧槽", delayMs: null },
      { text: "还真是3号了", delayMs: null },
      { text: "一天没吃饭竟然不饿", delayMs: null }
    ] },
    { player: "？", ding: [] }
  ]
};

window.endingUI = (() => {
  const dialogue = window.endingDialogue;
  const rounds = dialogue.rounds;
  const state = window.chatSession;
  const ending = state.ending;
  const ui = window.chatPreviewUI;
  const controls = window.chatControls;
  const history = document.getElementById("messages");
  const workspace = document.getElementById("workspace");
  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const bottom = () => { history.scrollTop = history.scrollHeight; };
  let typingTimer = null;
  let dots = 1;

  function renderTyping() {
    history.querySelector(".typing-message")?.remove();
    if (!ending.typing || state.currentId !== "ding") return;
    const chat = state.chats.find(item => item.id === "ding");
    const row = ui.renderMessage({ type: "text", sender: "丁子卓", avatar: "丁", time: "", text: `正在输入${"…".repeat(dots)}` }, chat);
    row.classList.add("typing-message");
    row.querySelector(".calibration-add")?.remove();
    row.setAttribute("aria-label", "丁子卓正在输入");
    history.append(row);
  }

  function setTyping(active) {
    ending.typing = active;
    window.clearInterval(typingTimer);
    dots = 1;
    renderTyping();
    if (active) typingTimer = window.setInterval(() => {
      dots = dots % 3 + 1;
      const bubble = history.querySelector(".typing-message .bubble");
      if (bubble) bubble.textContent = `正在输入${"…".repeat(dots)}`;
    }, 380);
    controls.updateSend();
    if (state.currentId === "ding") bottom();
  }

  function append(chat, text, self = false) {
    history.querySelector(".typing-message")?.remove();
    const previous = chat.messages[chat.messages.length - 1];
    const message = { id: `session-${state.nextMessageId++}`, type: "text", sender: self ? "我" : chat.name,
      avatar: self ? "我" : chat.avatar, self, ...window.nextMessageTimestamp(), text };
    chat.messages.push(message);
    if (state.currentId === chat.id) {
      ui.appendMessage(history, message, chat, previous);
      bottom();
    } else if (!self) state.unread[chat.id] = (state.unread[chat.id] || 0) + 1;
    controls.refreshList();
  }

  async function start() {
    if (ending.phase !== "idle" || !state.calibration.validated) return;
    ending.phase = "performing";
    document.querySelectorAll(".keyword-tag button").forEach(button => { button.disabled = true; });
    ending.locked = true;
    // 作废演出开始前尚未投递的机器人回复，防止清空后重新出现。
    state.botGeneration++;
    state.botBusy = false;
    state.restoringMembers = [];
    controls.cancelHistoryPull();
    document.getElementById("record-viewer").close();
    window.getSelection()?.removeAllRanges();
    document.querySelector(".keyword-picker").hidden = true;
    document.activeElement?.blur();
    workspace.inert = true;
    document.body.classList.add("ending-locked");
    controls.updateSend();
    const bot = state.chats.find(chat => chat.id === "assistant");
    controls.appendBotReply(bot, "参数正确，开始执行校准");
    if (state.currentId !== "assistant") {
      await wait(2500);
      controls.selectChat("assistant", true);
    }
    bottom();
    const repair = "正在尝试修复【错误：字符无法解析】";
    for (const delay of [4200, 3000, 2200, 1600, 1100]) {
      await wait(delay);
      controls.appendBotReply(bot, repair);
      bottom();
    }
    const characters = Array.from(repair);
    const remaining = characters.map((_, index) => index);
    while (remaining.length) {
      await wait(remaining.length === characters.length ? 700 : 65);
      // 每次只遮蔽一个尚未被替换的位置，已有方块保留。
      const index = remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0];
      characters[index] = "■";
      controls.appendBotReply(bot, characters.join(""));
      bottom();
    }
    for (let index = 0; index < 4; index++) {
      await wait(65);
      controls.appendBotReply(bot, characters.join(""));
      bottom();
    }
    document.body.classList.add("ending-flash");
    await wait(240);
    window.calibrationUI.finish();
    bot.messages = window.createSessionMessages(window.chatPreviewData.find(chat => chat.id === "assistant"));
    state.commandHistory.length = 0;
    state.historyCursor = 0;
    state.draftBeforeHistory = "";
    state.drafts.set("assistant", "");
    document.getElementById("message-input").value = "";
    ui.renderMessages(bot);
    bottom();
    const ding = state.chats.find(chat => chat.id === "ding");
    ding.status = "在线";
    append(ding, "？");
    // 首次恢复消息应在打开私聊时可见，而非停留在之前的旧记录位置。
    state.scrollPositions.delete("ding");
    ending.phase = "dialogue";
    document.body.classList.remove("ending-flash", "ending-locked");
    workspace.inert = false;
    ending.locked = false;
    controls.updateSend();
  }

  async function send() {
    if (ending.phase !== "dialogue" || ending.typing || ending.waiting || ending.locked) return;
    const round = rounds[ending.round++];
    const ding = state.chats.find(chat => chat.id === "ding");
    append(ding, round.player, true);
    if (round.ding.length) {
      ending.waiting = true;
      controls.updateSend();
      await wait(dialogue.reactionDelayMs);
      ending.waiting = false;
      setTyping(true);
    }
    for (const reply of round.ding) {
      await wait(reply.delayMs ?? dialogue.defaultDelayMs);
      append(ding, reply.text);
      renderTyping();
      if (state.currentId === "ding") bottom();
    }
    setTyping(false);
    if (ending.round === rounds.length) {
      ending.phase = "complete";
      const contact = { id: "milliliter", name: "毫升君", avatar: "毫", color: "assistant", type: "private", status: "在线", date: state.clock.date, messages: [] };
      state.chats.push(contact);
      append(contact, "恭喜完成MVP。");
      controls.updateSend();
    }
  }

  // inert 阻止聚焦和点击，另拦截滚动，保证演出最新消息始终可见。
  ["wheel", "touchmove"].forEach(type => document.addEventListener(type, event => {
    if (ending.locked) event.preventDefault();
  }, { passive: false }));
  return { start, send, renderTyping };
})();
