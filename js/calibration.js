// 校验记录并演出目标字符遮蔽；原始消息文本保持不变。
window.calibrationUI = (() => {
  const session = window.chatSession;
  const state = session.calibration;
  const ui = window.chatPreviewUI;
  const panel = document.getElementById("calibration-panel");
  const records = document.getElementById("calibration-records");
  const initialize = document.getElementById("calibration-initialize");
  const execute = document.getElementById("calibration-execute");
  const keywordPicker = ui.element("button", "keyword-picker", "添加关键词");
  keywordPicker.type = "button";
  keywordPicker.hidden = true;
  document.body.append(keywordPicker);
  let selectedKeyword = "";

  function keywordProblem(text) {
    if (session.ending.phase !== "idle") return "校准已完成";
    if (!text.length) return "请先选择文字";
    if (/[▧■]/u.test(text)) return "错误：字符无法解析";
    if (state.keywords.includes(text)) return "关键词已添加";
    if (state.keywords.length >= 20) return "关键词已达 20 个";
    return "";
  }

  function hideKeywordPicker() {
    keywordPicker.hidden = true;
    selectedKeyword = "";
  }

  function showKeywordPicker() {
    const selection = window.getSelection();
    if (session.ending.phase !== "idle" || state.phase !== "complete" || !selection || selection.isCollapsed || !selection.rangeCount) {
      hideKeywordPicker();
      return;
    }
    const range = selection.getRangeAt(0);
    const dialog = document.getElementById("record-viewer");
    const scope = dialog.open ? dialog : document.querySelector(".app");
    if (!scope.contains(range.startContainer) || !scope.contains(range.endContainer)) {
      hideKeywordPicker();
      return;
    }
    selectedKeyword = selection.toString();
    const problem = keywordProblem(selectedKeyword);
    keywordPicker.disabled = Boolean(problem);
    keywordPicker.textContent = problem || "添加关键词";
    // 原生模态窗之外的按钮不可交互，查看器选词按钮必须放在 dialog 内。
    const parent = dialog.open ? dialog : document.body;
    if (keywordPicker.parentElement !== parent) parent.append(keywordPicker);
    const rect = range.getBoundingClientRect();
    keywordPicker.hidden = false;
    const bounds = dialog.open ? dialog.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
    const width = keywordPicker.offsetWidth;
    const height = keywordPicker.offsetHeight;
    keywordPicker.style.left = `${Math.max(bounds.left + 8, Math.min(rect.left, bounds.right - width - 8))}px`;
    keywordPicker.style.top = `${Math.max(bounds.top + 8, Math.min(rect.bottom + 8, bounds.bottom - height - 8))}px`;
  }

  keywordPicker.addEventListener("pointerdown", event => event.preventDefault());
  keywordPicker.addEventListener("click", () => {
    if (state.phase !== "complete" || keywordProblem(selectedKeyword)) return;
    state.keywords.push(selectedKeyword);
    hideKeywordPicker();
    window.getSelection()?.removeAllRanges();
    render();
  });
  document.addEventListener("selectionchange", showKeywordPicker);
  document.addEventListener("pointerup", showKeywordPicker);
  document.addEventListener("scroll", hideKeywordPicker, true);
  window.addEventListener("resize", hideKeywordPicker);
  document.getElementById("record-viewer").addEventListener("close", hideKeywordPicker);

  function recordKey(chatId, messageId) {
    return `${chatId}/${messageId}`;
  }

  function paintText(element, message, key) {
    if (Object.hasOwn(session.calibratedMessages, key)) {
      element.textContent = session.calibratedMessages[key];
      return;
    }
    if (Object.hasOwn(state.replacements, key)) {
      const start = message.text.indexOf(message.calibrationTarget);
      element.textContent = message.text.slice(0, start) + state.replacements[key] + message.text.slice(start + message.calibrationTarget.length);
      return;
    }
    const mask = state.masks[key];
    if (!mask) return;
    element.replaceChildren();
    // 按 Unicode 字符遍历；不把玩家或作者原文当成 HTML。
    Array.from(message.text).forEach((character, index) => {
      element.append(mask[index]
        ? ui.element("span", "calibration-glyph", mask[index])
        : document.createTextNode(character));
    });
  }

  function bindText(element, message, chat) {
    if (!message.calibrationTarget) return;
    const key = recordKey(chat.id, message.id);
    element.classList.add("calibration-bound-text");
    element.dataset.calibrationKey = key;
    paintText(element, message, key);
  }

  function refreshText(message, key) {
    document.querySelectorAll(".calibration-bound-text").forEach(element => {
      if (element.dataset.calibrationKey === key) paintText(element, message, key);
    });
  }

  function refreshReplacements() {
    state.records.forEach(record => {
      const chat = session.chats.find(item => item.id === record.chatId);
      const message = chat.messages.find(item => item.id === record.messageId);
      refreshText(message, recordKey(chat.id, message.id));
    });
  }

  function applyKeyword(record, keyword) {
    if (session.ending.phase !== "idle") return;
    if (state.phase !== "complete" || !state.keywords.includes(keyword)) return;
    state.validated = false;
    state.error = "";
    const key = recordKey(record.chatId, record.messageId);
    if (state.replacements[key] === keyword) delete state.replacements[key];
    else state.replacements[key] = keyword;
    render();
    refreshReplacements();
  }

  function deleteKeyword(keyword) {
    if (session.ending.phase !== "idle") return;
    if (state.phase !== "complete") return;
    state.validated = false;
    state.error = "";
    state.keywords = state.keywords.filter(item => item !== keyword);
    Object.keys(state.replacements).forEach(key => {
      if (state.replacements[key] === keyword) delete state.replacements[key];
    });
    render();
    refreshReplacements();
  }

  function canExecute() {
    return state.phase === "complete" && state.records.length === state.requiredCount &&
      state.records.every(record => Object.hasOwn(state.replacements, recordKey(record.chatId, record.messageId)));
  }

  function executeCalibration() {
    if (!state.guiOpen || state.target !== "ding" || !canExecute() || state.validated) return;
    state.validated = state.records.every(record => {
      const chat = session.chats.find(item => item.id === record.chatId);
      const message = chat?.messages.find(item => item.id === record.messageId);
      return typeof message?.calibrationAnswer === "string" &&
        state.replacements[recordKey(record.chatId, record.messageId)] === message.calibrationAnswer;
    });
    state.error = state.validated ? "" : "校准失败，部分参数存在异常";
    render();
    if (state.validated) window.endingUI.start();
  }

  function initializeCalibration() {
    if (!state.guiOpen || state.target !== "ding" || !session.restoredMembers.ding || state.phase !== "idle") return;
    const expected = session.chats.flatMap(chat => chat.messages
      .filter(message => message.sender === "丁子卓" && message.calibrationTarget)
      .map(message => ({ message, key: recordKey(chat.id, message.id) })));
    const chosen = new Set(state.records.map(record => recordKey(record.chatId, record.messageId)));
    if (expected.length !== state.requiredCount || state.records.length !== state.requiredCount ||
        chosen.size !== expected.length || expected.some(record => !chosen.has(record.key))) {
      state.error = "记录选择错误，初始化失败";
      render();
      return;
    }
    const steps = [];
    for (const { message, key } of expected) {
      const start = message.text.indexOf(message.calibrationTarget);
      if (start < 0) {
        state.error = "记录选择错误，初始化失败";
        render();
        return;
      }
      const offset = Array.from(message.text.slice(0, start)).length;
      Array.from(message.calibrationTarget).forEach((_, index) => steps.push({ message, key, index: offset + index }));
    }
    // 随机安排全体目标字符，每个字符先经过纹理方块，再变为实心。
    for (let index = steps.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [steps[index], steps[other]] = [steps[other], steps[index]];
    }
    state.phase = "animating";
    state.error = "";
    render();
    function replaceNext(index) {
      if (index === steps.length) {
        state.phase = "complete";
        render();
        return;
      }
      const step = steps[index];
      const mask = state.masks[step.key] ||= {};
      mask[step.index] = "▧";
      refreshText(step.message, step.key);
      window.setTimeout(() => {
        mask[step.index] = "■";
        refreshText(step.message, step.key);
        window.setTimeout(() => replaceNext(index + 1), 110);
      }, 170);
    }
    replaceNext(0);
  }

  function selected(chatId, messageId) {
    return state.records.some(record => record.chatId === chatId && record.messageId === messageId);
  }

  function updateButtons() {
    document.querySelectorAll(".calibration-add").forEach(button => {
      const added = selected(button.dataset.chatId, button.dataset.messageId);
      button.hidden = !state.guiOpen || state.target !== "ding";
      button.disabled = state.phase !== "idle" || added || state.records.length >= state.requiredCount;
      button.textContent = added ? "✓" : "+";
      button.title = added ? "已添加此记录" : button.disabled ? "已添加 4 条记录，请先删除再添加" : "添加到校准记录";
      button.setAttribute("aria-label", button.title);
    });
  }

  function removeRecord(index) {
    if (state.phase !== "idle") return;
    state.records.splice(index, 1);
    state.error = "";
    render();
    const buttons = records.querySelectorAll("button");
    if (buttons.length) buttons[Math.min(index, buttons.length - 1)].focus();
    else document.getElementById("messages").focus({ preventScroll: true });
  }

  function render() {
    panel.hidden = !state.guiOpen;
    document.getElementById("workspace").classList.toggle("has-calibration", state.guiOpen);
    document.getElementById("calibration-target").textContent = `校准对象：${state.target === "ding" ? "好想吃大餐" : "未指定"}`;
    const count = document.getElementById("calibration-count");
    count.hidden = state.target === null;
    count.textContent = state.target === null ? "" : `待添加记录：${state.requiredCount - state.records.length}`;
    document.getElementById("calibration-actions").hidden = state.target === null;
    document.getElementById("calibration-feedback").textContent = state.error;
    initialize.disabled = state.phase !== "idle";
    initialize.hidden = state.phase === "complete";
    execute.hidden = state.phase !== "complete";
    execute.disabled = !canExecute() || state.validated;
    initialize.textContent = state.phase === "animating" ? "正在初始化……" : state.phase === "complete" ? "已初始化" : "初始化校准";
    const keywordHint = document.getElementById("calibration-keyword-hint");
    keywordHint.hidden = state.phase !== "complete";
    keywordHint.textContent = `关键词：${state.keywords.length}/20`;
    records.replaceChildren();
    state.records.forEach((record, index) => {
      const chat = session.chats.find(item => item.id === record.chatId);
      const message = chat.messages.find(item => item.id === record.messageId);
      const entry = ui.element("article", "calibration-record");
      const header = ui.element("div", "calibration-record-header");
      header.append(ui.element("span", "calibration-source", `${chat.type === "group" ? chat.name : "私聊"} · ${message.date || chat.date} ${message.time}`));
      const remove = ui.element("button", "calibration-remove", "删除");
      remove.type = "button";
      remove.disabled = state.phase !== "idle";
      remove.setAttribute("aria-label", `删除第 ${index + 1} 条校准记录`);
      remove.addEventListener("click", () => removeRecord(index));
      header.append(remove);
      entry.append(header);
      if (message.type === "image") {
        const image = ui.element("img", "calibration-image");
        image.src = message.src;
        image.alt = message.alt;
        image.width = message.width;
        image.height = message.height;
        entry.append(image);
      } else {
        const text = ui.element("p", "calibration-text", message.text);
        bindText(text, message, chat);
        entry.append(text);
      }
      if (state.phase === "complete") {
        const tags = ui.element("div", "calibration-keywords");
        tags.setAttribute("aria-label", "可替换的关键词");
        state.keywords.forEach(keyword => {
          const tag = ui.element("span", "keyword-tag");
          const apply = ui.element("button", "keyword-apply", keyword);
          apply.type = "button";
          apply.disabled = session.ending.phase !== "idle";
          apply.title = keyword;
          apply.setAttribute("aria-pressed", String(state.replacements[recordKey(record.chatId, record.messageId)] === keyword));
          apply.addEventListener("click", () => applyKeyword(record, keyword));
          const removeKeyword = ui.element("button", "keyword-delete", "×");
          removeKeyword.type = "button";
          removeKeyword.disabled = session.ending.phase !== "idle";
          removeKeyword.setAttribute("aria-label", `删除关键词：${keyword}`);
          removeKeyword.title = "从所有记录下方删除此关键词";
          removeKeyword.addEventListener("click", () => deleteKeyword(keyword));
          tag.append(apply, removeKeyword);
          tags.append(tag);
        });
        entry.append(tags);
      }
      records.append(entry);
    });
    updateButtons();
  }

  function addRecord(chatId, messageId) {
    if (state.phase !== "idle" || !state.guiOpen || state.target !== "ding" || !session.restoredMembers.ding ||
        state.records.length >= state.requiredCount || selected(chatId, messageId)) return;
    const chat = session.chats.find(item => item.id === chatId);
    const message = chat?.messages.find(item => item.id === messageId);
    if (!(chat?.type === "group" || chatId === "ding") || message?.sender !== "丁子卓" ||
        message.self || !["text", "image"].includes(message.type)) return;
    state.records.push({ chatId, messageId });
    state.error = "";
    render();
  }

  function decorateMessage(container, message, chat) {
    if (!(chat.type === "group" || chat.id === "ding") || message.sender !== "丁子卓" ||
        message.self || !["text", "image"].includes(message.type)) return;
    const button = ui.element("button", "calibration-add", "+");
    button.type = "button";
    button.dataset.chatId = chat.id;
    button.dataset.messageId = message.id;
    const added = selected(chat.id, message.id);
    button.hidden = !state.guiOpen || state.target !== "ding";
    button.disabled = state.phase !== "idle" || added || state.records.length >= state.requiredCount;
    button.textContent = added ? "✓" : "+";
    button.title = added ? "已添加此记录" : button.disabled ? "已添加 4 条记录，请先删除再添加" : "添加到校准记录";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", () => addRecord(chat.id, message.id));
    container.append(button);
  }

  function applyAction(action) {
    if (action.action === "toggle") {
      state.guiOpen = !state.guiOpen;
      render();
      return state.guiOpen ? "校准窗口已开启。" : "校准窗口已关闭。";
    }
    if (action.action === "target" && action.memberId === "ding" && session.restoredMembers.ding) {
      if (session.calibratedMembers.ding) return "该用户的校准已完成";
      state.target = "ding";
      render();
      return `手动成员校准手册：\n1.好想吃大餐所发送的消息中，存在${state.requiredCount}条【错误：无法解析字符】的消息有待校准。\n2.使用消息气泡右上角出现的按钮，标记所有待校准的消息。\n3.当所有的待校准消息被成功标记后，初始化校准。\n4.初始化完成后，每条消息的待校准部分将被自动解析。\n5.选中聊天记录中的任意字符，它们会被作为关键词加入。\n6.使用加入的关键词替换待校准部分。\n7.当所有的待校准消息被正确校准后，执行校准。\n注意：【错误：无法解析字符】未影响已保存的完整索引。`;
    }
    return "超出校准范围";
  }

  function authorFill(kind) {
    if (session.ending.phase !== "idle") return "该用户的校准已完成";
    const targets = session.chats.flatMap(chat => chat.messages
      .filter(message => message.sender === "丁子卓" && message.calibrationTarget)
      .map(message => ({ chat, message })));
    if (kind === "records") {
      if (state.phase !== "idle") return "已初始化，请刷新后重新测试记录选择。";
      state.guiOpen = true;
      state.target = "ding";
      state.records = targets.map(({ chat, message }) => ({ chatId: chat.id, messageId: message.id }));
      state.error = "";
      render();
      return "作者测试：已加入四条待校准记录。";
    }
    if (state.phase !== "complete") return "请先初始化校准，并等待演出完成。";
    const missing = [...new Set(targets.map(({ message }) => message.calibrationAnswer))]
      .filter(keyword => !state.keywords.includes(keyword));
    if (state.keywords.length + missing.length > 20) return "关键词数量将超过 20 个，请先删除部分关键词。";
    state.keywords.push(...missing);
    render();
    return "作者测试：已加入四个正确关键词。";
  }

  initialize.addEventListener("click", initializeCalibration);
  execute.addEventListener("click", executeCalibration);
  render();
  function finish() {
    // 保留校准后的聊天显示，清空侧栏的工作状态，不改写作者原文。
    state.records.forEach(record => {
      const chat = session.chats.find(item => item.id === record.chatId);
      const message = chat.messages.find(item => item.id === record.messageId);
      const key = recordKey(chat.id, message.id);
      const start = message.text.indexOf(message.calibrationTarget);
      session.calibratedMessages[key] = message.text.slice(0, start) + state.replacements[key] + message.text.slice(start + message.calibrationTarget.length);
    });
    session.calibratedMembers.ding = true;
    Object.assign(state, { guiOpen: false, target: null, records: [], phase: "idle", error: "", masks: {}, keywords: [], replacements: {}, validated: false });
    hideKeywordPicker();
    render();
  }
  return { decorateMessage, applyAction, bindText, finish, authorFill };
})();
