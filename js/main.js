(() => {
  const state = window.chatSession;
  const { chats, drafts, scrollPositions } = state;
  const ui = window.chatPreviewUI;
  const history = document.getElementById("messages");
  const input = document.getElementById("message-input");
  const send = document.querySelector(".send");
  const note = document.getElementById("composer-note");
  let composing = false;
  let historyPull = null;

  function renderHistorySync() {
    if (state.currentId === "assistant" || (state.currentId === "ding" && state.restoredMembers.ding)) {
      history.querySelector(".history-sync")?.remove();
      return;
    }
    let panel = history.querySelector(".history-sync");
    if (!panel) {
      panel = ui.element("div", "history-sync system-message");
      const status = ui.element("p", "system-text");
      status.setAttribute("role", "status");
      const retry = ui.element("button", "history-retry", "点击重试");
      retry.type = "button";
      retry.addEventListener("click", () => startHistorySync(true));
      panel.append(status, retry);
      history.prepend(panel);
    }
    const sync = state.historySync[state.currentId];
    panel.hidden = sync === "idle" || sync === "pulling";
    const failure = chats.find(chat => chat.id === state.currentId).type === "group"
      ? "一个或多个会话对象存在异常" : "会话对象存在异常";
    panel.querySelector(".system-text").textContent = sync === "loading"
      ? "正在同步历史聊天记录……"
      : sync === "failed" ? `${failure}\n历史聊天记录同步失败` : "";
    const retry = panel.querySelector(".history-retry");
    retry.disabled = sync !== "failed";
    retry.style.visibility = sync === "failed" ? "visible" : "hidden";
  }

  async function startHistorySync(retry = false) {
    if (state.ending.locked || state.currentId === "milliliter") return;
    if (state.openRecordSetId !== null || state.currentId === null || state.currentId === "assistant") return;
    const id = state.currentId;
    if (id === "ding" && state.restoredMembers.ding) return;
    const sync = state.historySync[id];
    if (sync === "pulling" || sync === "loading" || (sync === "failed" && !retry)) return;
    if (!retry && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.historySync[id] = "pulling";
      // 移动历史内容而不移动标题和输入区，回弹完成后再显示同步提示。
      const padding = parseFloat(window.getComputedStyle(history).paddingTop);
      const animation = history.animate([
        { paddingTop: `${padding}px`, offset: 0 },
        { paddingTop: `${padding + 26}px`, offset: 0.4 },
        { paddingTop: `${padding}px`, offset: 1 }
      ], { duration: 380, easing: "ease-in-out" });
      historyPull = animation;
      try {
        await animation.finished;
      } catch {
        return; // 切换会话取消回弹，不在新会话启动同步。
      } finally {
        if (historyPull === animation) historyPull = null;
      }
    }
    state.historySync[id] = "loading";
    renderHistorySync();
    history.scrollTop = 0;
    // 仅模拟同步失败；计时结束只刷新所属会话，不触碰聊天内容。
    window.setTimeout(() => {
      if (state.ending.locked) return;
      if (id === "ding" && state.restoredMembers.ding) return;
      state.historySync[id] = "failed";
      if (state.currentId === id) renderHistorySync();
    }, 1600);
  }

  history.addEventListener("wheel", event => {
    if (event.deltaY < 0 && !event.ctrlKey && history.scrollTop <= 0) startHistorySync();
  }, { passive: true });
  history.addEventListener("keydown", event => {
    if (event.target === history && !event.isComposing && history.scrollTop <= 0 &&
        ["ArrowUp", "PageUp", "Home"].includes(event.key)) startHistorySync();
  });

  function updateSend() {
    const dingReady = state.currentId === "ding" && state.ending.phase === "dialogue";
    input.disabled = state.ending.locked || (state.currentId === "ding" && state.ending.phase === "complete");
    // readonly 保留焦点和光标，同时阻止对方回复期间编辑。
    input.readOnly = state.ending.typing || state.ending.waiting;
    send.disabled = input.disabled || input.readOnly || (!dingReady && (state.currentId !== "assistant" || state.botBusy)) || !input.value.trim() || composing;
    if (state.currentId === "ding") note.textContent = state.ending.typing ? "对方正在输入……" : dingReady ? "Enter 发送 · Shift+Enter 换行" : "当前会话暂不支持发送消息";
    if (state.currentId === "assistant") note.textContent = state.botBusy
      ? "群助手正在回复，请稍候……" : "Enter 发送 · Shift+Enter 换行 · ↑↓ 命令历史";
  }

  function resetHistory() {
    state.historyCursor = state.commandHistory.length;
    state.draftBeforeHistory = "";
  }

  function fillInput(value) {
    input.value = value;
    drafts.set(state.currentId, value);
    input.focus();
    input.setSelectionRange(value.length, value.length);
    updateSend();
  }

  function restoreDingRecords() {
    if (state.restoredMembers.ding) return;
    state.restoredMembers.ding = true;
    state.historySync.ding = "idle";
    const chat = chats.find(item => item.id === "ding");
    const firstMessage = chat.messages[0];
    const oldTop = history.querySelector(".message")?.offsetTop || 0;
    const scrollTop = history.scrollTop;
    chat.messages = window.createSessionMessages(window.chatPreviewData.find(item => item.id === "ding"));
    if (state.currentId === "ding") {
      if (historyPull) { historyPull.cancel(); historyPull = null; }
      ui.renderMessages(chat);
      const index = chat.messages.findIndex(message => message.id === firstMessage.id);
      const newTop = history.querySelectorAll(".message")[index]?.offsetTop || 0;
      history.scrollTop = Math.max(0, scrollTop + newTop - oldTop);
    } else {
      // 下次进入时定位恢复后的最近消息，旧记录可直接向上阅读。
      scrollPositions.delete("ding");
    }
    ui.updatePreview(chat);
  }

  function appendBotReply(chat, reply) {
    const visible = state.currentId === chat.id;
    const atBottom = visible && history.scrollHeight - history.scrollTop - history.clientHeight < 32;
    const content = typeof reply === "string" ? { type: "text", text: reply } : reply;
    const message = { id: `session-${state.nextMessageId++}`, sender: "群助手", avatar: "助", ...window.nextMessageTimestamp(), ...content };
    const previous = chat.messages[chat.messages.length - 1];
    chat.messages.push(message);
    if (visible) ui.appendMessage(history, message, chat, previous);
    ui.updatePreview(chat);
    if (atBottom) history.scrollTop = history.scrollHeight;
    return message;
  }

  function scheduleRestore(chat, sequence) {
    const generation = state.botGeneration;
    state.restoringMembers.push(sequence.memberId);
    sequence.messages.slice(1).forEach((text, index) => {
      window.setTimeout(() => {
        if (generation !== state.botGeneration) return;
        const last = index === sequence.messages.length - 2;
        if (last) {
          if (sequence.memberId === "ding") restoreDingRecords();
          state.restoringMembers = state.restoringMembers.filter(id => id !== sequence.memberId);
        }
        appendBotReply(chat, text);
        if (last) { state.botBusy = false; updateSend(); }
      }, (index + 1) * 1200);
    });
  }

  function sendMessage() {
    if (state.ending.locked || state.ending.typing || state.ending.waiting || composing) return;
    if (state.currentId === "ding") {
      if (input.value.trim() && state.ending.phase === "dialogue") {
        fillInput("");
        window.endingUI.send();
      }
      return;
    }
    if (state.currentId !== "assistant" || composing || state.botBusy) return;
    const text = input.value.trim();
    if (!text) return;
    state.botBusy = true;
    const chat = chats.find(item => item.id === state.currentId);
    const atBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 32;
    const timestamp = window.nextMessageTimestamp();
    const messages = [
      { type: "text", sender: "我", avatar: "我", self: true, ...timestamp, text }
    ];
    messages.forEach(message => {
      message.id = `session-${state.nextMessageId++}`;
      const previousMessage = chat.messages[chat.messages.length - 1];
      chat.messages.push(message);
      ui.appendMessage(history, message, chat, previousMessage);
    });
    // 所有回复（包括错误与卡片）统一停顿；始终投递到发起命令的机器人会话。
    const generation = state.botGeneration;
    window.setTimeout(() => {
      if (generation !== state.botGeneration) return;
      const reply = window.chatBot.reply(text);
      if (reply.type === "song-egg") {
        state.songEggUsed = true;
        const message = appendBotReply(chat, reply.text);
        window.setTimeout(() => {
          if (generation !== state.botGeneration) return;
          message.type = "system";
          message.text = "群助手撤回了一条消息";
          if (state.currentId === chat.id) {
            const top = history.scrollTop;
            ui.renderMessages(chat);
            history.scrollTop = top;
          }
          ui.updatePreview(chat);
          window.setTimeout(() => {
            if (generation !== state.botGeneration) return;
            appendBotReply(chat, reply.fallback);
            state.botBusy = false;
            updateSend();
          }, 700);
        }, 1200);
      } else if (reply.type === "author-action") {
        if (reply.action === "records" && state.ending.phase === "idle" && state.calibration.phase === "idle") restoreDingRecords();
        appendBotReply(chat, window.calibrationUI.authorFill(reply.action));
        state.botBusy = false;
        updateSend();
      } else if (reply.type === "restore-sequence") {
        appendBotReply(chat, reply.messages[0]);
        scheduleRestore(chat, reply);
      } else if (reply.type === "calibration-action") {
        appendBotReply(chat, window.calibrationUI.applyAction(reply));
        state.botBusy = false;
        updateSend();
      } else {
        appendBotReply(chat, reply);
        state.botBusy = false;
        updateSend();
      }
    }, 600);
    if (text.startsWith("/")) state.commandHistory.push(text);
    resetHistory();
    fillInput("");
    ui.updatePreview(chat);
    if (atBottom) history.scrollTop = history.scrollHeight;
  }

  function selectChat(id, forced = false) {
    if (state.ending.locked && !forced) return;
    if (id === state.currentId) return;
    if (historyPull) {
      state.historySync[state.currentId] = "idle";
      historyPull.cancel();
      historyPull = null;
    }
    if (state.currentId !== null) {
      drafts.set(state.currentId, input.value);
      scrollPositions.set(state.currentId, history.scrollTop);
    }
    state.currentId = id;
    state.unread[id] = 0;
    document.querySelectorAll(".conversation").forEach(button => {
      if (button.dataset.chatId === id) button.querySelector(".unread-badge")?.remove();
    });
    resetHistory();
    const chat = chats.find(item => item.id === id);
    // 保留会话按钮节点，让键盘切换后焦点仍留在原按钮。
    document.querySelectorAll(".conversation").forEach((button, index) => {
      const selected = chats[index].id === id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-current", String(selected));
    });
    ui.renderMessages(chat);
    if (id !== "milliliter") renderHistorySync();
    window.endingUI?.renderTyping();
    input.value = drafts.get(id) || "";
    note.textContent = id === "assistant"
      ? "Enter 发送 · Shift+Enter 换行 · ↑↓ 命令历史"
      : "当前会话暂不支持发送消息";
    updateSend();
    history.scrollTop = scrollPositions.has(id) ? scrollPositions.get(id) : history.scrollHeight;
    if (id === "ding" && state.ending.phase === "dialogue") input.focus({ preventScroll: true });
  }

  send.addEventListener("click", sendMessage);
  input.addEventListener("compositionstart", () => { composing = true; updateSend(); });
  input.addEventListener("compositionend", () => { composing = false; updateSend(); });
  input.addEventListener("input", () => {
    drafts.set(state.currentId, input.value);
    resetHistory();
    updateSend();
  });
  input.addEventListener("keydown", event => {
    if (state.ending.locked || state.ending.typing || state.ending.waiting || !["assistant", "ding"].includes(state.currentId) || composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    } else if (state.currentId === "assistant" && (event.key === "ArrowUp" || event.key === "ArrowDown") && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (!state.commandHistory.length) return;
      event.preventDefault();
      if (state.historyCursor === state.commandHistory.length) state.draftBeforeHistory = input.value;
      const direction = event.key === "ArrowUp" ? -1 : 1;
      state.historyCursor = Math.max(0, Math.min(state.commandHistory.length, state.historyCursor + direction));
      fillInput(state.historyCursor === state.commandHistory.length
        ? state.draftBeforeHistory : state.commandHistory[state.historyCursor]);
    }
  });

  ui.renderList(chats, "group", selectChat);
  selectChat("group");
  window.chatControls = { selectChat, updateSend, appendBotReply,
    refreshList: () => ui.renderList(chats, state.currentId, selectChat),
    cancelHistoryPull() {
      if (historyPull) { historyPull.cancel(); historyPull = null; }
    }
  };
})();
