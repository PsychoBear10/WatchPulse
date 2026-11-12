import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (nextTags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  suggestions = [],
  placeholder = 'Add tag (Enter)...',
}) => {
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const clean = raw.trim().replace(/^#/, '');
    if (!clean) return;
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...tags, clean]);
    setDraft('');
  };

  const removeTag = (target: string) => {
    onChange(tags.filter((t) => t !== target));
  };

  const unusedSuggestions = suggestions
    .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
    .slice(0, 6);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-500/15 text-indigo-200 border border-indigo-500/30"
          >
            <span>#{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-indigo-300/70 hover:text-white transition-colors"
              title={`Remove ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag(draft);
            }
          }}
          placeholder={placeholder}
          className="studio-input text-xs py-1.5"
        />
        <button
          type="button"
          onClick={() => addTag(draft)}
          disabled={!draft.trim()}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-200 border border-white/10 hover:bg-white/[0.12] disabled:opacity-40 transition-colors shrink-0 inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className="text-[10px] text-slate-500 mr-1">Quick add:</span>
          {unusedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-white/[0.04] border border-white/[0.06] hover:text-indigo-200 hover:border-indigo-500/30 transition-colors"
            >
              +{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
