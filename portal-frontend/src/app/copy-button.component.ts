import { Component, Input, OnDestroy, signal } from '@angular/core';

/** Copie un texte dans le presse-papiers et le confirme brièvement (utile pour URL et adresses à coller). */
@Component({
  selector: 'app-copy-button',
  standalone: true,
  template: `
    <button type="button" class="copy" (click)="copy()" [attr.aria-label]="(copied() ? 'Copied ' : 'Copy ') + label">
      {{ copied() ? 'Copied' : 'Copy' }}
    </button>
  `,
})
export class CopyButtonComponent implements OnDestroy {
  @Input({ required: true }) text = '';
  /** Ce qui est copié, pour les lecteurs d'écran (« Copy gateway URL »). */
  @Input() label = 'to clipboard';

  readonly copied = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  copy(): void {
    try {
      navigator.clipboard.writeText(this.text).then(
        () => {
          this.copied.set(true);
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.copied.set(false), 2000);
        },
        () => undefined,
      );
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé) : le texte reste sélectionnable à la main.
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
