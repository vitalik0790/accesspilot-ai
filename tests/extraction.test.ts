import { describe, expect, it } from 'vitest';
import { extractPage } from '../src/content/extract';
import { analyzeAccessibility } from '../src/accessibility/analyzer';

describe('page extraction and accessibility analysis', () => {
  it('extracts readable text without hidden content, scripts, or form values', () => {
    document.title = 'A useful page';
    document.body.innerHTML = `<main><h1>Welcome</h1><p>Useful information</p>
      <script>secret script</script><style>.secret{color:red}</style>
      <div hidden>hidden secret</div><div style="display:none">CSS secret</div>
      <div aria-hidden="true"><p>ARIA secret</p></div>
      <input value="private input"><textarea>private message</textarea>
      <select><option>private option</option></select><div contenteditable="true">private draft</div></main>`;
    const page = extractPage();
    expect(page.title).toBe('A useful page');
    expect(page.text).toBe('Welcome\nUseful information');
    expect(page.truncated).toBe(false);
  });
  it('detects all three issues and accepts decorative images and named controls', () => {
    document.body.innerHTML = `<img src="a"><img alt=""><img alt="A tree">
      <button></button><button>Save</button><button aria-label="Close"></button>
      <span id="name">Menu</span><div role="button" aria-labelledby="name"></div>
      <button><img alt="Search"></button><input type="submit">
      <input placeholder="Not a label"><label for="email">Email</label><input id="email">
      <label>Message<textarea></textarea></label><select aria-label="Country"></select>
      <input type="hidden"><button hidden></button>`;
    const issues = analyzeAccessibility(extractPage());
    expect(issues.map(issue => issue.code)).toEqual(['missing-alt', 'unlabeled-button', 'missing-label']);
  });
  it('uses referenced and ARIA names while rejecting broken references', () => {
    document.body.innerHTML = `<span id="label">Name</span><input aria-labelledby="label">
      <input aria-labelledby="missing"><input aria-label="Phone"><input title="Address">`;
    expect(analyzeAccessibility(extractPage())).toHaveLength(1);
  });
  it('caps page text and reports truncation', () => {
    document.body.textContent = 'a'.repeat(20000);
    const page = extractPage();
    expect(page.text).toHaveLength(16000);
    expect(page.truncated).toBe(true);
  });
  it('keeps hidden and editable descendants out of all names and structure cues', () => {
    document.body.innerHTML = `<main><h1>Overview<span hidden>hidden-secret</span></h1>
      <label>Message<textarea>draft-secret</textarea></label>
      <button>Save<span aria-hidden="true">aria-secret</span><span contenteditable>edit-secret</span></button>
      <button><img hidden alt="image-secret"></button>
      <span id="hidden-label" hidden>reference-secret</span><input aria-labelledby="hidden-label">
      <input type="password" value="password-secret"><input type="button" value="value-secret">
      <div role="textbox">widget-secret</div><div contenteditable><button aria-label="editable-secret"></button></div>
      <details><summary>More</summary><p>collapsed-secret</p></details>
      <p style="opacity:0">transparent-secret</p></main>`;
    const page = extractPage();
    expect(JSON.stringify(page)).not.toContain('-secret');
    expect(page.fields[0].name).toBe('Message');
    expect(page.buttons[0].name).toBe('Save');
    expect(page.structure).toContainEqual({ kind: 'heading', name: 'Overview' });
    expect(page.text).toContain('More');
  });
  it('includes compact structure without URLs, raw markup, or input values', () => {
    document.body.innerHTML = `<main><h1>Guide</h1><a href="https://example.com/?token=secret">Read guide</a>
      <button aria-label="Close"></button><label for="email">Email</label><input id="email" value="private">
      <img src="private-url" alt="A tree"></main>`;
    const page = extractPage();
    expect(page.structure).toEqual([
      { kind: 'landmark', name: 'main' }, { kind: 'heading', name: 'Guide' },
      { kind: 'link', name: 'Read guide' }, { kind: 'button', name: 'Close' },
      { kind: 'form-label', name: 'Email' }, { kind: 'image', name: 'A tree' },
    ]);
    expect(JSON.stringify(page)).not.toMatch(/private|token=|<main>/);
  });
  it('bounds structure cues and indicates when more are omitted', () => {
    document.body.innerHTML = Array.from({ length: 42 }, () => `<h2>${'a'.repeat(300)}</h2>`).join('');
    const page = extractPage();
    expect(page.structure).toHaveLength(40);
    expect(page.structure.every(item => item.name.length <= 160)).toBe(true);
    expect(page.truncated).toBe(true);
  });
});
