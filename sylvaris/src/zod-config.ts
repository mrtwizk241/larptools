// Zod 4 probes `Function('')` to decide whether it can compile fast parsers. A strict Content
// Security Policy (no 'unsafe-eval') reports that probe as a violation, so turn the JIT off.
// Imported first in main.tsx, before any module that builds or runs a schema (audit S-04).
import { z } from 'zod';

z.config({ jitless: true });
