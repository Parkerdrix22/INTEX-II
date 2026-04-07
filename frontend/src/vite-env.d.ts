/// <reference types="vite/client" />

// vite-imagetools: must mirror Vite's `*?` query patterns (see vite/client.d.ts).
declare module '*?format=webp&quality=82&w=1920' {
  const src: string;
  export default src;
}

declare module '*?format=webp&quality=82&w=960' {
  const src: string;
  export default src;
}
