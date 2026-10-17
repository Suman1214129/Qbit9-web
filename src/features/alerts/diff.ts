import type { TokenView } from "@/domain";

export interface AlertMessage {
  /** Same tag replaces the previous notification of that kind. */
  tag: string;
  title: string;
  body: string;
  tone: "info" | "success" | "warn";
  vibrate?: boolean;
  /** Where tapping the notification goes. */
  url: string;
}

/**
 * Turn "what changed between two views of the same token" into messages. Pure, so it is tested
 * once and works the same whether updates come from the mock timer or Supabase Realtime.
 */
export function diffAlerts(prev: TokenView, next: TokenView, firstName: string | null): AlertMessage[] {
  if (prev.id !== next.id) return [];
  const url = `/token/${next.code}`;
  const out: AlertMessage[] = [];
  const who = firstName ? `, ${firstName}` : "";

  if (next.movedBack > prev.movedBack && next.stage !== "missed") {
    out.push({
      tag: `${next.id}-moved`,
      title: "Your place moved back",
      body: `${next.code} is now ${next.ahead} ${next.ahead === 1 ? "person" : "people"} from the front. It is never cancelled. Check in when you are back.`,
      tone: "warn",
      url,
    });
  }

  if (prev.stage !== next.stage) {
    switch (next.stage) {
      case "checkin":
        out.push({ tag: `${next.id}-near`, title: `You are ${next.ahead} away`, body: "Check in so the counter knows you are coming.", tone: "info", vibrate: true, url });
        break;
      case "called":
        out.push({
          tag: `${next.id}-called`,
          title: `Your turn${who}`,
          body: next.counter ? `Please go to counter ${next.counter} now. Token ${next.code}.` : `Please go to the counter now. Token ${next.code}.`,
          tone: "success",
          vibrate: true,
          url,
        });
        break;
      case "missed":
        out.push({ tag: `${next.id}-missed`, title: "You missed your turn", body: `Token ${next.code} was closed. You can join the queue again.`, tone: "warn", url });
        break;
      case "served":
        out.push({ tag: `${next.id}-served`, title: "Visit complete", body: "Tell us how it went. It takes one tap.", tone: "success", url: `/visit/${next.code}` });
        break;
      default:
        break;
    }
  }
  return out;
}
