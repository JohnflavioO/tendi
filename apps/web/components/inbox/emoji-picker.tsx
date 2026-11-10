'use client';

const GROUPS: Array<{ label: string; emojis: string[] }> = [
  { label: 'Rostos', emojis: ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😉', '🙂', '🙃', '😅', '😇', '🤔', '😎', '🥳', '😢', '😭', '😡', '😴', '🤗'] },
  { label: 'Gestos', emojis: ['👍', '👎', '👏', '🙌', '🙏', '💪', '👌', '✌️', '🤝', '👋', '🤞', '👀'] },
  { label: 'Símbolos', emojis: ['❤️', '💜', '💙', '🔥', '⭐', '✨', '✅', '❌', '⚠️', '❓', '❗', '💯', '🎉', '🎁', '📌', '📎'] },
  { label: 'Negócios', emojis: ['📞', '📱', '💬', '📧', '📅', '⏰', '💰', '💳', '📦', '🚚', '🏠', '🛒', '📝', '📄', '🔔', '🔗'] },
];

/** Seletor simples de emojis. Sem dependências: clique insere o emoji na mensagem. */
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return <>
    <button type="button" aria-label="Fechar emojis" onClick={onClose} className="fixed inset-0 z-20 cursor-default" />
    <div role="dialog" aria-label="Escolher emoji" className="absolute bottom-12 left-0 z-30 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
        {GROUPS.map(group => <div key={group.label}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group.label}</p>
          <div className="grid grid-cols-8 gap-0.5">{group.emojis.map(emoji => <button key={emoji} type="button" aria-label={emoji} onClick={() => onPick(emoji)} className="rounded-lg p-1.5 text-lg leading-none hover:bg-slate-100">{emoji}</button>)}</div>
        </div>)}
      </div>
    </div>
  </>;
}
