export function alignLaserPointerLayer(layer: HTMLElement) {
  layer.setCssStyles({ transform: "" });
  const { left, top } = layer.getBoundingClientRect();
  if (left !== 0 || top !== 0) {
    layer.setCssStyles({ transform: `translate(${-left}px, ${-top}px)` });
  }
}

export function installLaserPointerAlignment(root: HTMLElement) {
  const align = () => {
    const layer = root.querySelector<HTMLElement>(".SVGLayer");
    if (layer) {
      alignLaserPointerLayer(layer);
    }
  };
  const observer = new MutationObserver(align);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("resize", align);
  align();

  return () => {
    observer.disconnect();
    window.removeEventListener("resize", align);
  };
}
