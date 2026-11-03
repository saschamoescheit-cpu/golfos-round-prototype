// jsQR: as a script it sets self.jsQR, built as a module its default export (QrScan.tsx takes either)
declare const jsQR: (data: Uint8ClampedArray, width: number, height: number, o?: { inversionAttempts?: string }) => { data: string } | null;
export default jsQR;
