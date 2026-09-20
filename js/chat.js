// 只负责会话渲染；用户文字始终通过文本属性显示。
window.chatPreviewUI = {
  characterStyles: {
    "丁子卓": { id: "ding", avatar: "asset/avatars/ding_avatar.png" },
    "余晓明": { id: "yu", avatar: "asset/avatars/yu_avatar.png" },
    "谢雨菲": { id: "xie", avatar: "asset/avatars/xie_avatar.png" },
    "陶子欣": { id: "tao", avatar: "asset/avatars/tao_pigeon_avatar.png" },
    "白赋": { id: "bai", avatar: "asset/avatars/bai_avatar.png" }
  },
  characterStyle(name) {
    return Object.hasOwn(this.characterStyles, name) ? this.characterStyles[name] : null;
  },
  element(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  },
  renderAvatar(style, color, fallback) {
    const avatar = this.element("span", `avatar ${color}`, fallback);
    avatar.setAttribute("aria-hidden", "true");
    if (style) {
      const image = this.element("img", "avatar-image");
      image.src = style.avatar;
      image.alt = "";
      image.width = 40;
      image.height = 40;
      image.addEventListener("error", () => { avatar.textContent = fallback; });
      avatar.replaceChildren(image);
    }
    return avatar;
  },
  renderList(chats, selectedId, onSelect) {
    const list = document.getElementById("conversations");
    list.replaceChildren();
    chats.forEach(chat => {
      const button = this.element("button", `conversation${chat.id === selectedId ? " selected" : ""}`);
      button.type = "button";
      button.dataset.chatId = chat.id;
      button.setAttribute("aria-label", chat.name);
      button.setAttribute("aria-current", chat.id === selectedId ? "true" : "false");
      const avatar = this.renderAvatar(this.characterStyle(chat.name), chat.color, chat.avatar);
      const details = this.element("span", "conversation-details");
      const top = this.element("span", "conversation-top");
      const last = chat.messages[chat.messages.length - 1];
      top.append(this.element("span", "conversation-name", chat.name), this.element("span", "conversation-time", last.time));
      details.append(top, this.element("span", "conversation-preview", this.messagePreview(last)));
      button.append(avatar, details);
      const unread = window.chatSession.unread[chat.id] || 0;
      if (unread) button.append(this.element("span", "unread-badge", String(unread)));
      button.addEventListener("click", () => onSelect(chat.id));
      list.append(button);
    });
    document.querySelector(".list-heading span").textContent = `${chats.length} 个会话`;
  },
  updatePreview(chat) {
    const button = [...document.querySelectorAll(".conversation")].find(item => item.dataset.chatId === chat.id);
    const last = chat.messages[chat.messages.length - 1];
    button.querySelector(".conversation-time").textContent = last.time;
    button.querySelector(".conversation-preview").textContent = this.messagePreview(last);
  },
  messagePreview(message) {
    switch (message.type) {
      case "image": return message.mediaKind === "meme" ? "[表情包]" : "[图片]";
      case "record-card": return `[资料] ${message.title}`;
      default: return message.text;
    }
  },
  renderText(text, chat) {
    const bubble = this.element("p", "bubble");
    if (chat?.type !== "group") {
      bubble.textContent = text;
      return bubble;
    }
    const names = [...new Set([
      ...Object.keys(chat.nicknames), ...Object.values(chat.nicknames),
      ...window.botData.members.flatMap(member => member.aliases), "全体成员"
    ])].sort((a, b) => b.length - a.length);
    // 按完整成员名匹配，名字里的空格不是提及的结束位置；长名字优先。
    const pattern = new RegExp(`@(?:${names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      bubble.append(document.createTextNode(text.slice(cursor, match.index)));
      bubble.append(this.element("span", "message-mention", match[0]));
      cursor = match.index + match[0].length;
    }
    bubble.append(document.createTextNode(text.slice(cursor)));
    return bubble;
  },
  renderContent(message, chat) {
    switch (message.type) {
      case "image": {
        const bubble = this.element("div", "bubble image-bubble");
        // 按素材比例限制长边；宽图获得更大宽度，竖图保持原有阅读尺寸。
        const ratio = message.width > 0 && message.height > 0 ? message.width / message.height : 1;
        const width = message.mediaKind === "meme"
          ? Math.min(180, 180 * ratio)
          : Math.min(420, 320 * ratio);
        bubble.style.width = `${width + 14}px`;
        const image = this.element("img", "message-image");
        image.src = message.src;
        image.alt = message.alt;
        // 固定素材尺寸提前预留空间，避免加载图片后改变历史滚动位置。
        image.width = message.width;
        image.height = message.height;
        bubble.append(image);
        return bubble;
      }
      case "record-card": {
        const recordSet = window.recordSets[message.recordSetId];
        const card = this.element("button", "bubble record-card");
        card.type = "button";
        card.disabled = !recordSet;
        card.setAttribute("aria-haspopup", "dialog");
        card.setAttribute("aria-controls", "record-viewer");
        card.append(
          this.element("span", "record-label", "资料卡片"),
          this.element("span", "record-title", message.title),
          this.element("span", "record-summary", message.summary),
          this.element("span", "record-count", recordSet ? `${recordSet.entries.length} 条记录 · 点击查看` : "资料暂不可用")
        );
        card.addEventListener("click", event => window.recordViewer.open(message.recordSetId, card, event.detail === 0));
        return card;
      }
      case "text": {
        const bubble = this.renderText(message.text, chat);
        window.calibrationUI?.bindText(bubble, message, chat);
        return bubble;
      }
      default: return this.element("p", "bubble", "暂不支持的消息类型");
    }
  },
  renderMessage(message, chat) {
    if (message.type === "system") {
      const row = this.element("article", "message system-message");
      row.append(this.element("span", "message-time", message.time), this.element("p", "system-text", message.text));
      return row;
    }
    const style = message.self ? null : this.characterStyle(message.sender);
    const row = this.element("article", `message${message.self ? " self" : ""}${style ? ` character-${style.id}` : ""}`);
    const avatar = this.renderAvatar(style, message.self ? "player" : chat.color, message.avatar);
    const body = this.element("div", "message-body");
    const meta = this.element("div", "message-meta");
    if (chat.type === "group") {
      meta.append(this.element("span", "message-sender", chat.nicknames[message.sender] || message.sender));
    }
    meta.append(this.element("span", "message-time", message.time));
    const content = this.renderContent(message, chat);
    const contentWrap = this.element("div", "message-content");
    contentWrap.append(content);
    window.calibrationUI?.decorateMessage(contentWrap, message, chat);
    body.append(meta, contentWrap);
    row.append(avatar, body);
    return row;
  },
  formatDate(date) {
    const day = new Date(`${date}T00:00:00Z`);
    const weekday = "日一二三四五六"[day.getUTCDay()];
    return `${day.getUTCMonth() + 1} 月 ${day.getUTCDate()} 日 · 星期${weekday}`;
  },
  appendMessage(history, message, chat, previousMessage) {
    const date = message.date || chat.date;
    const previousDate = previousMessage ? (previousMessage.date || chat.date) : null;
    // 使用明确日期与固定时区，历史间隔不受系统时区或夏令时影响。
    const gap = previousMessage
      ? Date.parse(`${date}T${message.time}:00Z`) - Date.parse(`${previousDate}T${previousMessage.time}:00Z`)
      : 0;
    if (date !== previousDate) {
      const label = message.date ? this.formatDate(date) : date;
      history.append(this.element("div", "date-divider", label));
    } else if (message.type !== "system" && gap > 120000) {
      history.append(this.element("div", "date-divider", message.time));
    }
    history.append(this.renderMessage(message, chat));
  },
  renderMessages(chat) {
    document.getElementById("chat-title").textContent = chat.name;
    document.getElementById("chat-status").textContent = chat.status;
    const history = document.getElementById("messages");
    history.setAttribute("aria-label", `${chat.name}的聊天历史`);
    history.replaceChildren();
    chat.messages.forEach((message, index) => {
      this.appendMessage(history, message, chat, chat.messages[index - 1]);
    });
  }
};
