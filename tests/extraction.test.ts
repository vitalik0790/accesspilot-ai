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
});
