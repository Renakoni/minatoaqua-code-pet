type DisplayEvent = {
  event: string;
  notificationKind?: string;
  title?: string;
  message?: string;
  detail?: string;
  tool?: string;
  cwd?: string;
};

export type DisplayLanguage = "en" | "zh";

function privateTitle(event: DisplayEvent, language: DisplayLanguage): string {
  const zh = language === "zh";
  if (event.notificationKind === "attention") return zh ? "需要处理" : "Attention required";
  if (event.notificationKind === "info") return zh ? "通知" : "Notification";
  if (event.tool) return zh ? `${event.tool} 操作` : `${event.tool} activity`;

  switch (event.event) {
    case "session_start": return zh ? "会话已开始" : "Session started";
    case "prompt_submit": return zh ? "新任务" : "New task";
    case "permission-prompt":
    case "permission_wait": return zh ? "权限请求" : "Permission request";
    case "completed":
    case "done": return zh ? "已完成" : "Completed";
    case "error": return zh ? "任务出错" : "Task error";
    case "git_operation": return zh ? "Git 操作" : "Git activity";
    case "idle":
    case "heartbeat": return zh ? "等待中" : "Waiting";
    default: return zh ? "活动更新" : "Activity update";
  }
}

export function redactDisplayEvent<T extends DisplayEvent>(event: T, language: DisplayLanguage = "en"): T {
  return {
    ...event,
    title: privateTitle(event, language),
    message: "",
    detail: undefined,
    cwd: undefined
  };
}
