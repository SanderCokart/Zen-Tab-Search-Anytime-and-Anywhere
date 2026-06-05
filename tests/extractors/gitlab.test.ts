import { describe, expect, it } from "vitest";
import { findNoteElements, isSonarQubeNote, parseNoteElement } from "../../lib/extractors/gitlab";
import { gitlabExtractor } from "../../lib/extractors/gitlab";

describe("gitlab extractor", () => {
  it("parses a discussion note element", () => {
    document.body.innerHTML = `
      <ul id="notes-list">
        <li id="note_42" class="note">
          <div class="timeline-content">
            <a class="author-name-link" href="/alice">Alice</a>
            <span class="author-username">@alice</span>
            <time datetime="2026-01-01T10:00:00Z">1 hour ago</time>
            <div class="note-text">Looks good to me</div>
          </div>
        </li>
      </ul>
    `;

    const el = document.querySelector("#note_42")!;
    const parsed = parseNoteElement(el, 1);

    expect(parsed.noteId).toBe("42");
    expect(parsed.author).toBe("Alice");
    expect(parsed.username).toBe("alice");
    expect(parsed.body).toBe("Looks good to me");
    expect(parsed.messageType).toBe("note");
  });

  it("detects SonarQube integration notes", () => {
    document.body.innerHTML = `
      <li id="note_99">
        <div class="timeline-content">
          <a class="author-name-link">SonarQube</a>
          <div class="note-text">Quality gate passed</div>
        </div>
      </li>
    `;

    const el = document.querySelector("#note_99")!;
    expect(isSonarQubeNote(el)).toBe(true);
  });

  it("detects SonarQube notes by body content when author is a human", () => {
    document.body.innerHTML = `
      <li id="note_483290">
        <div class="timeline-content">
          <a class="author-name-link">Frank Assink</a>
          <span class="author-username">@fassink</span>
          <div class="note-text">SonarQube Code Analysis
Quality Gate passed
Issues
 0 New issues
 0 Fixed issues
 0 Accepted issues
Measures
 0 Security Hotspots
 78.3% Coverage on New Code
 0.0% Duplication on New Code
See analysis details on SonarQube</div>
        </div>
      </li>
    `;

    const el = document.querySelector("#note_483290")!;
    expect(isSonarQubeNote(el)).toBe(true);
  });

  it("excludes SonarQube notes posted under a human author from findNoteElements", () => {
    document.body.innerHTML = `
      <div id="notes-list">
        <li id="note_1">
          <div class="timeline-content">
            <a class="author-name-link">Bob</a>
            <div class="note-text">Human comment</div>
          </div>
        </li>
        <li id="note_483290">
          <div class="timeline-content">
            <a class="author-name-link">Frank Assink</a>
            <div class="note-text">SonarQube Code Analysis
Quality Gate passed
Issues
 0 New issues
Measures
 78.3% Coverage on New Code
See analysis details on SonarQube</div>
          </div>
        </li>
      </div>
    `;

    const root = document.querySelector("#notes-list")!;
    const notes = findNoteElements(root);

    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe("note_1");
  });

  it("parses file name from diff discussion notes on merge request overview", () => {
    document.body.innerHTML = `
      <ul id="notes-list">
        <li id="note_483505" class="note note-comment" data-discussion-id="f883125242899f4e91eac47e6c98ff1598406988">
          <div class="timeline-entry-inner">
            <div class="timeline-content">
              <a class="author-name-link" href="/jschreurs">Jan-Willem Schreurs</a>
              <span class="author-username">@jschreurs</span>
              <time datetime="2026-06-05T11:13:01.601+02:00">4 hours ago</time>
              <div class="discussion js-discussion-container">
                <div class="discussion-body">
                  <div class="diff-file file-holder card discussion-wrapper text-file">
                    <div class="file-title file-title-flex-parent">
                      <div class="file-header-content">
                        <strong
                          data-testid="file-name-content"
                          class="file-title-name"
                          data-original-title="Global/Includes/Library/Login/GlobalFunctions.php"
                        >Global/Includes/Library/Login/GlobalFunctions.php</strong>
                      </div>
                    </div>
                    <div class="diff-content">
                      <div class="line-numbers" data-linenumber>124</div>
                    </div>
                  </div>
                  <div class="note-text">Dit is niet de juiste plek voor de aanpassing.</div>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    `;

    const el = document.querySelector("#note_483505")!;
    const parsed = parseNoteElement(el, 1);

    expect(parsed.fileName).toBe("Global/Includes/Library/Login/GlobalFunctions.php");
    expect(parsed.line).toBe("124");
  });

  it("parses file name when note is nested under diff-content without diff-file ancestor", () => {
    document.body.innerHTML = `
      <div class="discussion-wrapper">
        <div class="file-title">
          <strong data-testid="file-name-content" class="file-title-name">app/Models/Product.php</strong>
        </div>
        <div class="diff-content">
          <span class="diff-line-num">42</span>
          <li id="note_100" class="note">
            <div class="timeline-content">
              <a class="author-name-link" href="/bob">Bob</a>
              <div class="note-text">Check this line</div>
            </div>
          </li>
        </div>
      </div>
    `;

    const el = document.querySelector("#note_100")!;
    const parsed = parseNoteElement(el, 1);

    expect(parsed.fileName).toBe("app/Models/Product.php");
    expect(parsed.line).toBe("42");
  });

  it("canHandle matches gitlab hostnames", () => {
    Object.defineProperty(window, "location", {
      value: new URL("https://gitlab.example.com/group/project/-/merge_requests/1"),
      writable: true,
    });

    expect(gitlabExtractor.canHandle()).toBe(true);
  });
});
