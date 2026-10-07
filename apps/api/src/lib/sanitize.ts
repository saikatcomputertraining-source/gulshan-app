const ALLOWED_TAGS = new Set(["p","br","strong","b","em","i","u","ul","ol","li","h2","h3","h4","blockquote","a"]);
export function sanitizeHtml(input:string){
  return String(input||"")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (_m, tag, attrs) => {
      const t=String(tag).toLowerCase();
      if(!ALLOWED_TAGS.has(t)) return "";
      if(t==="br") return "<br>";
      if(t==="a"){
        const href=String(attrs).match(/href\s*=\s*["']([^"']+)["']/i)?.[1]||"";
        if(!/^https?:\/\//i.test(href)) return "<a>";
        const safe=href.replace(/&/g,"&amp;").replace(/"/g,"&quot;");
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">`;
      }
      return `<${t}>`;
    })
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}
