"use client";

/**
 * Renderiza o Markdown restrito que a análise devolve: títulos `##`, listas e
 * `**negrito**`. Feito à mão em vez de trazer uma dependência — o prompt
 * limita a saída a esse subconjunto, e assim nada de HTML da resposta chega
 * ao DOM.
 */
function inline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function Markdown({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  function flushList() {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-1.5">
        {list.map((item, i) => (
          <li
            key={i}
            className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
          >
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
            <span>{inline(item, `li-${blocks.length}-${i}`)}</span>
          </li>
        ))}
      </ul>
    );
    list = [];
  }

  for (const raw of content.split("\n")) {
    const line = raw.trim();

    if (line === "") {
      flushList();
      continue;
    }
    if (line.startsWith("#")) {
      flushList();
      blocks.push(
        <h3
          key={`h-${blocks.length}`}
          className="pt-1 text-xs font-bold uppercase tracking-wider text-foreground"
        >
          {line.replace(/^#+\s*/, "")}
        </h3>
      );
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      list.push(line.replace(/^([-*]|\d+\.)\s+/, ""));
      continue;
    }

    flushList();
    blocks.push(
      <p
        key={`p-${blocks.length}`}
        className="text-xs leading-relaxed text-muted-foreground"
      >
        {inline(line, `p-${blocks.length}`)}
      </p>
    );
  }
  flushList();

  return <div className="space-y-3">{blocks}</div>;
}
