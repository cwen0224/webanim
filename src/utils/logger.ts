export const Logger = {
  logs: [] as string[],
  log: (...args: any[]) => {
    const msg = args.map(a => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try { return JSON.stringify(a) } catch { return String(a) }
      }
      return String(a);
    }).join(' ');
    
    Logger.logs.push(`[${new Date().toISOString()}] ${msg}`);
    if (Logger.logs.length > 1000) Logger.logs.shift();
    console.info('[LOG]', msg);
  },
  getLogs: () => Logger.logs.join('\n')
}
