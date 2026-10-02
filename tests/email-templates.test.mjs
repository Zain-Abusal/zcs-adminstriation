import test from 'node:test';
import assert from 'node:assert/strict';
import { emailTemplates, renderEmailTemplate } from '../src/email-templates.ts';
test('all studio presets render escaped content and safe button URLs', () => {
  for (const template of emailTemplates) {
    const html = renderEmailTemplate(template, { title: '<script>alert(1)</script>', content: 'A & B\n\nSecond paragraph', action: '<img onerror=x>', url: 'https://www.zcraftstudios.com/news?q=a&b=c' });
    assert.ok(html.includes(template.badge));
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /A &amp; B/);
    assert.match(html, /&lt;img onerror=x&gt;/);
    assert.match(html, /q=a&amp;b=c/);
    assert.doesNotMatch(html, /<script>/);
    assert.throws(() => renderEmailTemplate(template, { title: 'Title', content: 'Body', action: 'Open', url: 'javascript:alert(1)' }), /HTTPS or HTTP/);
  }
});
