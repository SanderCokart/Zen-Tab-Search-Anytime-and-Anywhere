import { describe, expect, it } from "vitest";
import { parseMessageElement } from "../../lib/extractors/freshdesk";

describe("freshdesk extractor", () => {
  it("parses a conversation message element", () => {
    document.body.innerHTML = `
      <div class="ticket-details__item requestor">
        <div data-test-id="user-name"><b>Jane Agent</b></div>
        <div data-test-id="conversation-status">E-mail verzonden</div>
        <div data-test-id="time-ago">2 hours ago <span class="timeago-units">(Jan 1)</span></div>
        <div data-test-id="time-info" aria-label="January 1, 2026"></div>
        <div data-test-id="conversation-12345"></div>
        <div data-test-conversation="conversation-text">
          <div class="ticket_note" data-note-id="99">Hello from support</div>
        </div>
        <div data-test-is-agent="true"></div>
      </div>
    `;

    const el = document.querySelector(".ticket-details__item")!;
    const parsed = parseMessageElement(el, 1);

    expect(parsed.author).toBe("Jane Agent");
    expect(parsed.status).toBe("E-mail verzonden");
    expect(parsed.channel).toBe("email");
    expect(parsed.noteId).toBe("99");
    expect(parsed.body).toBe("Hello from support");
    expect(parsed.messageType).toBe("customer");
  });
});
