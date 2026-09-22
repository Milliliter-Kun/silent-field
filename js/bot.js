// 只解析和查询数据；不访问 DOM，也不修改剧情或会话状态。
window.chatBot = (() => {
  const maxInputLength = 500;
  const unknownCommand = "无法识别指令。输入 /help 查看可用命令。";
  const members = [
    { id: "ding", aliases: ["猪宝", "好想吃大餐"] },
    { id: "yu", aliases: ["狼宝", "最初版"] },
    { id: "xie", aliases: ["鹅宝", "Limit Break"] },
    { id: "tao", aliases: ["鸽宝", "黄油蛛丝"] },
    { id: "bai", aliases: ["豹宝", "来财来"] }
  ];

  function parseCommand(input) {
    const text = input.trim();
    const match = text.match(/^(\/\S+)(?:\s+([\s\S]*))?$/);
    return { command: match ? match[1] : "", argument: match ? (match[2] || "").trim() : "" };
  }

  const handlers = {
    "/dev": argument => ["records", "keywords"].includes(argument)
      ? { type: "author-action", action: argument }
      : "作者测试用法：/dev records 或 /dev keywords",
    "/help": argument => argument
      ? "用法：/help（不需要参数）"
      : "当前可用命令：\n/help — 查看帮助\n/member --list — 查看群内成员列表\n/member <群昵称或用户名> — 查询群内成员信息\n/restore <群昵称或用户名> — 恢复记录\n/search <索引> — 查询已保存的完整索引\n/calibrate --gui — 开启或关闭校准窗口\n/calibrate <群昵称或用户名> — 指定校准对象",
    "/member": argument => {
      if (!argument) return "用法：/member --list 或 /member <群昵称或用户名>";
      if (argument === "--list") return "1. 好想吃大餐/猪宝\n2. 错误：成员状态不支持读取\n3. 错误：成员状态不支持读取\n4. 错误：成员状态不支持读取\n5. 错误：成员状态不支持读取";
      const member = members.find(item => item.aliases.includes(argument));
      if (!member) return `未找到成员「${argument}」。`;
      if (member.id !== "ding" ) return `已找到成员[${argument}]\n错误：成员状态不支持读取`;
      if (!window.chatSession.restoredMembers.ding) return `已找到成员[${argument}]\n错误：成员数据不完整`;
      return window.botData.members.find(item => item.aliases.includes("猪宝")).text;
    },
    "/restore": argument => {
      if (!argument) return "用法：/restore <群昵称或用户名>";
      const member = members.find(item => item.aliases.includes(argument));
      if (!member) return `未找到成员「${argument}」。`;
      if (window.chatSession.restoringMembers.includes(member.id)) return "该对象的记录正在恢复，请稍候。";
      if (member.id === "ding" && window.chatSession.restoredMembers.ding) return "该对象的记录已恢复。";
      return {
        type: "restore-sequence", memberId: member.id,
        messages: member.id === "ding"
          ? [`正在解析与[${argument}]相关的索引。`, `尝试恢复[${argument}]的记录……`, `已成功恢复与[${argument}]有关的部分记录。`]
          : [`正在解析与[${argument}]相关的索引。`, "解析失败……"]
      };
    },
    "/calibrate": argument => {
      if (!argument) return "用法：/calibrate --gui 或 /calibrate <群昵称或用户名>";
      if (argument === "--gui") return { type: "calibration-action", action: "toggle" };
      const member = members.find(item => item.aliases.includes(argument));
      if (!member) return `未找到成员「${argument}」。`;
      if (member.id !== "ding" || !window.chatSession.restoredMembers.ding) return "当前成员超出可校准范围";
      if (window.chatSession.calibratedMembers[member.id]) return "该用户的校准已完成";
      return { type: "calibration-action", action: "target", memberId: "ding" };
    },
    "/search": argument => {
      if (!argument) return "用法：/search <索引>";
      const index = window.botData.indexes.find(item => item.aliases.includes(argument));
      if (!index) return `未找到索引「${argument}」。`;
      return index.recordSetId
        ? { type: "record-card", title: index.title, summary: index.summary, recordSetId: index.recordSetId }
        : index.text;
    }
  };

  function reply(input) {
    if (input.trim().length > maxInputLength) return `输入过长，请控制在 ${maxInputLength} 字以内。`;
    if (input.trim() === "想听高俗歌曲" && !window.chatSession.songEggUsed) {
      return { type: "song-egg", text: "就向天际吧", fallback: unknownCommand };
    }
    const { command, argument } = parseCommand(input);
    return Object.hasOwn(handlers, command) ? handlers[command](argument) : unknownCommand;
  }

  return { parseCommand, reply, maxInputLength };
})();
