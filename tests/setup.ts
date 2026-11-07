// vitest setup — jsdom canvas mock for furjs (2026)
// jsdom has no Canvas2D; we stub minimal API for ChamferMask/ColorRamp/Physics tests
// Real rendering is tested via build + playground, not unit

if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.getContext.toString().includes('mock')) {
  const orig = HTMLCanvasElement.prototype.getContext as any;
  HTMLCanvasElement.prototype.getContext = function(type: string, opts?: any) {
    if (type === '2d') {
      // minimal 2d stub that satisfies ChamferMask tests (measureText, getImageData, etc.)
      const canvas = this as HTMLCanvasElement;
      const w = (canvas as any).width || 320;
      const h = (canvas as any).height || 200;
      return {
        canvas,
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'round',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        font: '10px sans-serif',
        setTransform() {},
        clearRect() {},
        fillRect() {},
        fillText() {},
        stroke() {},
        moveTo() {},
        lineTo() {},
        beginPath() {},
        closePath() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        rotate() {},
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        measureText(text: string) {
          // approximate width: 0.6 * fontSize * chars
          const m = /(\d+)px/.exec(this.font);
          const fs = m ? parseInt(m[1],10) : 10;
          return {
            width: text.length * fs * 0.6,
            actualBoundingBoxAscent: fs * 0.72,
            actualBoundingBoxDescent: fs * 0.02,
          } as any;
        },
        getImageData(_x:number,_y:number,w:number,h:number) {
          // return white for 0,0 large, otherwise transparent — enough for chamfer tests
          const len = w * h * 4;
          const data = new Uint8ClampedArray(len);
          // fill with alpha 255 for all pixels if canvas is small (mask), else checker
          for(let i=0;i<len;i+=4){ data[i]=255; data[i+1]=255; data[i+2]=255; data[i+3]= 255; }
          return { data, width: w, height: h, colorSpace: 'srgb' } as any;
        },
        putImageData() {},
        drawImage() {},
        clip() {},
        fill() {},
        strokeRect() {},
        setLineDash() {},
        getTransform() { return new DOMMatrix(); },
      } as any;
    }
    // try real if available
    if (orig) try { return orig.call(this, type, opts); } catch {}
    return null as any;
  } as any;
}
