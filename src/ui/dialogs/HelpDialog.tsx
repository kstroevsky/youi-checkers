import { HELP_SECTIONS } from '@/features/settings/helpContent';

type HelpDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Rules and help">
        <div className="dialog__header">
          <h2>Rules / Правила</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dialog__content">
          {HELP_SECTIONS.map((section) => (
            <section key={section.headingEn} className="dialog__section">
              <div>
                <h3>{section.headingEn}</h3>
                <p>{section.bodyEn}</p>
              </div>
              <div>
                <h3>{section.headingRu}</h3>
                <p>{section.bodyRu}</p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
