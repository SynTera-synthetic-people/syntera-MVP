declare module "*.mp4" {
  const src: string;
  export default src;
}
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
declare module '*.module.css' {
  const classes: { readonly [className: string]: string };
  export default classes;
}
declare module '*.css' {
  const classes: { readonly [className: string]: string };
  export default classes;
}