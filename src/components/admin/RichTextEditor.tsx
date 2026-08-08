import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Link as LinkIcon, List, ListOrdered, Palette, Highlighter, Paperclip, Image as ImageIcon, Eraser, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  onAttachmentsChange?: (files: File[]) => void;
  attachments?: File[];
}

const PALETTE = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#ffffff",
  "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#3949ab", "#8e24aa",
  "#ff6b6b", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#748ffc", "#da77f2",
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Tapez votre message...",
  minHeight = 200,
  onAttachmentsChange,
  attachments = [],
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Sync external value when editor is empty / not focused
  useEffect(() => {
    if (editorRef.current && !isFocused && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value, isFocused]);

  const exec = (cmd: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const insertLink = () => {
    const url = window.prompt("URL du lien :", "https://");
    if (url) exec("createLink", url);
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      exec("insertImage", dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length && onAttachmentsChange) {
      onAttachmentsChange([...attachments, ...files]);
    }
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => {
    if (!onAttachmentsChange) return;
    onAttachmentsChange(attachments.filter((_, i) => i !== idx));
  };

  const ToolBtn = ({ onClick, title, children }: any) => (
    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}>
      {children}
    </Button>
  );

  return (
    <div className="border rounded-md overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
        <ToolBtn onClick={() => exec("bold")} title="Gras"><Bold className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Italique"><Italic className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Souligné"><Underline className="h-4 w-4" /></ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <select
          className="h-8 text-xs bg-background border rounded px-1"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { exec("fontSize", e.target.value); e.currentTarget.selectedIndex = 0; }}
          defaultValue=""
          title="Taille"
        >
          <option value="" disabled>Taille</option>
          <option value="2">Petit</option>
          <option value="3">Normal</option>
          <option value="4">Moyen</option>
          <option value="5">Grand</option>
          <option value="6">XL</option>
        </select>

        {/* Text color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Couleur du texte" onMouseDown={(e) => e.preventDefault()}>
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-7 gap-1">
              {PALETTE.map((c) => (
                <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("foreColor", c)} className="w-6 h-6 rounded border" style={{ background: c }} />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Highlight */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Surlignage" onMouseDown={(e) => e.preventDefault()}>
              <Highlighter className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-7 gap-1">
              {PALETTE.map((c) => (
                <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("hiliteColor", c)} className="w-6 h-6 rounded border" style={{ background: c }} />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Liste à puces"><List className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")} title="Liste numérotée"><ListOrdered className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("justifyLeft")} title="Aligner à gauche"><AlignLeft className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("justifyCenter")} title="Centrer"><AlignCenter className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => exec("justifyRight")} title="Aligner à droite"><AlignRight className="h-4 w-4" /></ToolBtn>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolBtn onClick={insertLink} title="Insérer un lien"><LinkIcon className="h-4 w-4" /></ToolBtn>
        <ToolBtn onClick={() => imageInputRef.current?.click()} title="Insérer une image"><ImageIcon className="h-4 w-4" /></ToolBtn>
        {onAttachmentsChange && (
          <ToolBtn onClick={() => fileInputRef.current?.click()} title="Joindre un fichier"><Paperclip className="h-4 w-4" /></ToolBtn>
        )}
        <ToolBtn onClick={() => exec("removeFormat")} title="Effacer la mise en forme"><Eraser className="h-4 w-4" /></ToolBtn>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        data-placeholder={placeholder}
        className={cn(
          "px-3 py-2 outline-none text-sm prose prose-sm max-w-none",
          "[&_a]:text-primary [&_a]:underline",
          "[&[data-placeholder]:empty]:before:content-[attr(data-placeholder)] [&[data-placeholder]:empty]:before:text-muted-foreground"
        )}
        style={{ minHeight }}
      />

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="border-t px-3 py-2 flex flex-wrap gap-2 bg-muted/20">
          {attachments.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-background border rounded px-2 py-1 text-xs">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[200px] truncate">{f.name}</span>
              <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span>
              <button type="button" onClick={() => removeAttachment(i)} className="text-destructive hover:underline">×</button>
            </div>
          ))}
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilePick} />
    </div>
  );
}
