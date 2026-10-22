import { Component } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { CopyButtonComponent } from './copy-button.component';

@Component({
  standalone: true,
  imports: [CopyButtonComponent],
  template: `<app-copy-button text="https://gw.bank.internal/payments/1.4" label="Default URL" />`,
})
class HostComponent {}

describe('CopyButtonComponent', () => {
  function setup(writeText: jasmine.Spy) {
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText } as unknown as Clipboard);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    return { fixture, button };
  }

  it('copies the text, says so for two seconds, then goes back to "Copy"', fakeAsync(() => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    const { fixture, button } = setup(writeText);
    expect(button.textContent?.trim()).toBe('Copy');
    expect(button.getAttribute('aria-label')).toBe('Copy Default URL');

    button.click();
    flushMicrotasks();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledOnceWith('https://gw.bank.internal/payments/1.4');
    expect(button.textContent?.trim()).toBe('Copied');
    expect(button.getAttribute('aria-label')).toBe('Copied Default URL');

    tick(2000);
    fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('Copy');
  }));

  it('does not claim success when the clipboard refuses', fakeAsync(() => {
    const writeText = jasmine.createSpy('writeText').and.rejectWith(new Error('denied'));
    const { fixture, button } = setup(writeText);

    button.click();
    flushMicrotasks();
    fixture.detectChanges();

    expect(button.textContent?.trim()).toBe('Copy');
  }));

  it('survives a missing clipboard (insecure context)', () => {
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue(undefined as unknown as Clipboard);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(() => (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click()).not.toThrow();
  });

  it('can carry its own caption and show what it copies on hover, without triggering the row behind it', fakeAsync(() => {
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText } as unknown as Clipboard);
    const fixture = TestBed.createComponent(CaptionHostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.textContent?.trim()).toBe('Copy internal URL');
    expect(button.title).toBe('https://gw-int/payments');
    button.click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(fixture.componentInstance.rowClicks).toBe(0);
    expect(button.textContent?.trim()).toBe('Copied');
    tick(2000);
  }));
});

@Component({
  standalone: true,
  imports: [CopyButtonComponent],
  template: `<div (click)="rowClicks = rowClicks + 1"><app-copy-button text="https://gw-int/payments" caption="Copy internal URL" hint="https://gw-int/payments" /></div>`,
})
class CaptionHostComponent {
  rowClicks = 0;
}
