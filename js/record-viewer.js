// 所有资料集合共用此窗口；展示与关闭均不修改聊天消息或剧情。
window.recordViewer = (() => {
  const dialog = document.getElementById("record-viewer");
  const content = document.getElementById("record-viewer-content");
  const closeButton = document.getElementById("record-viewer-close");
  const element = (...args) => window.chatPreviewUI.element(...args);
  let opener = null;
  let restoreOpenerFocus = true;
  let pointerStartedOutside = false;

  function renderEntry(entry) {
    const article = element("article", "record-entry");
    const meta = [entry.time, entry.source].filter(Boolean).join(" · ");
    if (meta) article.append(element("p", "record-entry-meta", meta));
    entry.messages.forEach(message => {
      const block = element("div", "record-entry-message");
      const byline = [message.speaker, message.time].filter(Boolean).join(" · ");
      if (byline) block.append(element("p", "record-entry-meta", byline));
      if (message.type === "image") {
        const image = element("img", "record-entry-image");
        image.src = message.src;
        image.alt = message.alt || "记录图片";
        if (message.width && message.height) {
          image.width = message.width;
          image.height = message.height;
        }
        block.append(image);
      } else {
        block.append(element("p", "record-entry-text", message.text));
      }
      article.append(block);
    });
    return article;
  }

  function open(recordSetId, trigger, restoreFocus = true) {
    const recordSet = window.recordSets[recordSetId];
    if (!recordSet || dialog.open) return;
    opener = trigger || document.activeElement;
    restoreOpenerFocus = restoreFocus;
    window.chatSession.openRecordSetId = recordSetId;
    document.getElementById("record-viewer-title").textContent = recordSet.title;
    document.getElementById("record-viewer-meta").textContent =
      `${recordSet.entries.length} 条记录`;
    content.replaceChildren(...recordSet.entries.map(renderEntry));
    if (!recordSet.entries.length) content.append(element("p", "record-entry-text", "暂无记录。"));
    dialog.showModal();
    content.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  }

  closeButton.addEventListener("click", () => dialog.close());
  // 原生 dialog 提供 Esc 关闭、焦点约束和底层界面不可交互。
  dialog.addEventListener("close", () => {
    window.chatSession.openRecordSetId = null;
    if (opener && opener.isConnected) {
      if (restoreOpenerFocus) {
        opener.focus({ preventScroll: true });
      } else if (document.activeElement === opener) {
        // dialog 会自动归还焦点；鼠标打开时清除此焦点，避免 Esc 留下聚焦样式。
        opener.blur();
      }
    }
    opener = null;
    pointerStartedOutside = false;
  });

  function isOutside(event) {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  }

  // 在正文选中文字后拖到遮罩，不应误关窗口。
  dialog.addEventListener("pointerdown", event => { pointerStartedOutside = isOutside(event); });
  dialog.addEventListener("click", event => {
    if (pointerStartedOutside && isOutside(event)) dialog.close();
    pointerStartedOutside = false;
  });

  return { open };
})();
