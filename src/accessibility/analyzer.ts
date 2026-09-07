import type { AccessibilityIssue, PageSnapshot } from '../shared/types';
export function analyzeAccessibility(page: PageSnapshot): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  page.images.forEach((image, index) => {
    if (!image.hasAlt) issues.push({ code: 'missing-alt', element: `Image ${index + 1}`, message: 'Image is missing an alt attribute. Add descriptive text, or empty alt text if decorative.' });
  });
  page.buttons.forEach((button, index) => {
    if (!button.name.trim()) issues.push({ code: 'unlabeled-button', element: `Button ${index + 1}`, message: 'Button has no detectable accessible name.' });
  });
  page.fields.forEach((field, index) => {
    if (!field.name.trim()) issues.push({ code: 'missing-label', element: `Form field ${index + 1}`, message: 'Form field has no detectable label. Use an associated label or an ARIA name.' });
  });
  return issues;
}
