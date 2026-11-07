/**
 * ChamferWorker — Off-thread chamfer distance transform for furjs
 * 
 * Spec: “run off-thread in a Web Worker or memoized during text/font changes”
 * 
 * Usage:
 *   const worker = createChamferWorker();
 *   const field = await worker.build(MW, MH, alphaBuffer);
 *   worker.terminate();
 * 
 * Falls back to main-thread sync build if Worker unavailable (SSR, CSP).
 * Uses transferable ArrayBuffers to avoid copy.
 */

export interface ChamferWorkerRequest {
  id: number;
  MW: number;
  MH: number;
  alpha: Uint8Array; // transferred
}

export interface ChamferWorkerResponse {
  id: number;
  ndx: Float32Array;
  ndy: Float32Array;
  halfStroke: number;
  error?: string;
}

const workerScript = `
self.onmessage = (e) => {
  const { id, MW, MH, alpha } = e.data;
  try {
    const n = MW * MH;
    const dist = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const INF = 1e9;
    for (let i=0;i<n;i++) {
      if (alpha[i] > 128) { dist[i]=INF; vx[i]=0; vy[i]=0; }
      else { dist[i]=0; vx[i]=0; vy[i]=0; }
    }
    const D1=1, D2=1.41421356;
    for (let y=0;y<MH;y++) for(let x=0;x<MW;x++) {
      const i=y*MW+x; if(dist[i]===0) continue;
      let best=dist[i],bx=vx[i],by=vy[i];
      if(x>0){ let j=i-1,d=dist[j]+D1; if(d<best){best=d;bx=vx[j]-1;by=vy[j];} if(y>0){j=i-MW-1;d=dist[j]+D2; if(d<best){best=d;bx=vx[j]-1;by=vy[j]-1;}}}
      if(y>0){ let j2=i-MW,d2=dist[j2]+D1; if(d2<best){best=d2;bx=vx[j2];by=vy[j2]-1;} if(x<MW-1){j2=i-MW+1;d2=dist[j2]+D2; if(d2<best){best=d2;bx=vx[j2]+1;by=vy[j2]-1;}}}
      dist[i]=best; vx[i]=bx; vy[i]=by;
    }
    for(let y=MH-1;y>=0;y--) for(let x=MW-1;x>=0;x--){
      const i=y*MW+x; if(dist[i]===0) continue;
      let best=dist[i],bx=vx[i],by=vy[i];
      if(x<MW-1){ let j=i+1,d=dist[j]+D1; if(d<best){best=d;bx=vx[j]+1;by=vy[j];} if(y<MH-1){j=i+MW+1;d=dist[j]+D2; if(d<best){best=d;bx=vx[j]+1;by=vy[j]+1;}}}
      if(y<MH-1){ let j2=i+MW,d2=dist[j2]+D1; if(d2<best){best=d2;bx=vx[j2];by=vy[j2]+1;} if(x>0){j2=i+MW-1;d2=dist[j2]+D2; if(d2<best){best=d2;bx=vx[j2]-1;by=vy[j2]+1;}}}
      dist[i]=best; vx[i]=bx; vy[i]=by;
    }
    let mx=0; for(let i=0;i<n;i++) if(alpha[i]>128 && dist[i]>mx && dist[i]<INF*0.5) mx=dist[i];
    if(mx<1) mx=4;
    self.postMessage({id, ndx: vx, ndy: vy, halfStroke: mx}, [vx.buffer, vy.buffer]);
  } catch(err){
    self.postMessage({id, error: String(err)});
  }
};
`;

let workerUrl: string | null = null;
function getWorkerUrl(): string | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;
  if (workerUrl) return workerUrl;
  try {
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    workerUrl = URL.createObjectURL(blob);
    return workerUrl;
  } catch { return null; }
}

export interface ChamferWorkerHandle {
  build(MW: number, MH: number, alpha: Uint8Array): Promise<{ ndx: Float32Array; ndy: Float32Array; halfStroke: number }>;
  terminate(): void;
}

export function createChamferWorker(): ChamferWorkerHandle | null {
  const url = getWorkerUrl();
  if (!url) return null;
  let w: Worker;
  try { w = new Worker(url); } catch { return null; }
  let nextId = 1;
  const pending = new Map<number, { resolve: (v:any)=>void; reject:(e:any)=>void }>();

  w.onmessage = (e: MessageEvent<ChamferWorkerResponse>) => {
    const { id, ndx, ndy, halfStroke, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve({ ndx, ndy, halfStroke });
  };
  w.onerror = (ev) => {
    // reject all
    for (const [,p] of pending) p.reject(ev);
    pending.clear();
  };

  return {
    build(MW:number, MH:number, alpha:Uint8Array){
      return new Promise((resolve,reject)=>{
        const id = nextId++;
        pending.set(id,{resolve,reject});
        // Transfer alpha copy — worker will not mutate alpha, but we transfer to avoid clone
        // Clone to keep caller alpha intact
        const copy = new Uint8Array(alpha);
        try { w.postMessage({id, MW, MH, alpha: copy}, [copy.buffer]); }
        catch { w.postMessage({id, MW, MH, alpha: copy}); }
      });
    },
    terminate(){ try{ w.terminate(); }catch{} pending.clear(); }
  };
}

/**
 * Sync fallback (main-thread) — identical to ChamferMask.buildChamfer but standalone
 * for when Worker is unavailable or CSP blocks blob:.
 */
export function buildChamferSync(MW:number, MH:number, alpha:Uint8Array): { ndx: Float32Array; ndy: Float32Array; halfStroke:number } {
  const n = MW*MH;
  const dist=new Float32Array(n), vx=new Float32Array(n), vy=new Float32Array(n);
  const INF=1e9;
  for(let i=0;i<n;i++) if(alpha[i]>128){dist[i]=INF;} else dist[i]=0;
  const D1=1,D2=1.41421356;
  for(let y=0;y<MH;y++) for(let x=0;x<MW;x++){ const i=y*MW+x; if(dist[i]===0) continue; let best=dist[i],bx=vx[i],by=vy[i]; if(x>0){let j=i-1,d=dist[j]+D1; if(d<best){best=d;bx=vx[j]-1;by=vy[j];} if(y>0){j=i-MW-1;d=dist[j]+D2; if(d<best){best=d;bx=vx[j]-1;by=vy[j]-1;}}} if(y>0){let j2=i-MW,d2=dist[j2]+D1; if(d2<best){best=d2;bx=vx[j2];by=vy[j2]-1;} if(x<MW-1){j2=i-MW+1;d2=dist[j2]+D2; if(d2<best){best=d2;bx=vx[j2]+1;by=vy[j2]-1;}}} dist[i]=best; vx[i]=bx; vy[i]=by; }
  for(let y=MH-1;y>=0;y--) for(let x=MW-1;x>=0;x--){ const i=y*MW+x; if(dist[i]===0) continue; let best=dist[i],bx=vx[i],by=vy[i]; if(x<MW-1){let j=i+1,d=dist[j]+D1; if(d<best){best=d;bx=vx[j]+1;by=vy[j];} if(y<MH-1){j=i+MW+1;d=dist[j]+D2; if(d<best){best=d;bx=vx[j]+1;by=vy[j]+1;}}} if(y<MH-1){let j2=i+MW,d2=dist[j2]+D1; if(d2<best){best=d2;bx=vx[j2];by=vy[j2]+1;} if(x>0){j2=i+MW-1;d2=dist[j2]+D2; if(d2<best){best=d2;bx=vx[j2]-1;by=vy[j2]+1;}}} dist[i]=best; vx[i]=bx; vy[i]=by; }
  let mx=0; for(let i=0;i<n;i++) if(alpha[i]>128 && dist[i]>mx && dist[i]<INF*0.5) mx=dist[i];
  if(mx<1) mx=4;
  return { ndx: vx, ndy: vy, halfStroke: mx };
}
