const fs = require('fs');
const code = fs.readFileSync('app.js', 'utf8');
const lines = code.split('\n');

const CHR_SINGLE = "'".charCodeAt(0);
const CHR_DOUBLE = '"'.charCodeAt(0);
const CHR_BACKTICK = '`'.charCodeAt(0);

let bd = 0, pd = 0;
let is_single = false, is_double = false, is_template = false;
let in_line_comment = false, in_block_comment = false;
const brace_stack = [];

for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    in_line_comment = false;

    for (let ci = 0; ci < line.length; ci++) {
        const cc = line.charCodeAt(ci);
        const nc = line.charCodeAt(ci + 1);

        if (in_block_comment) {
            if (cc === 42 && nc === 47) { in_block_comment = false; ci++; }
            continue;
        }
        if (in_line_comment) continue;
        if (is_single) {
            if (cc === 92) { ci++; continue; }
            if (cc === CHR_SINGLE) is_single = false;
            continue;
        }
        if (is_double) {
            if (cc === 92) { ci++; continue; }
            if (cc === CHR_DOUBLE) is_double = false;
            continue;
        }
        if (is_template) {
            if (cc === 92) { ci++; continue; }
            if (cc === CHR_BACKTICK) is_template = false;
            continue;
        }

        if (cc === 47 && nc === 47) { in_line_comment = true; break; }
        if (cc === 47 && nc === 42) { in_block_comment = true; ci++; continue; }
        if (cc === CHR_SINGLE) { is_single = true; continue; }
        if (cc === CHR_DOUBLE) { is_double = true; continue; }
        if (cc === CHR_BACKTICK) { is_template = true; continue; }

        if (cc === 123) { bd++; brace_stack.push({ l: li + 1, ctx: line.trim().slice(0, 55) }); }
        if (cc === 125) { bd--; if (brace_stack.length > 0) brace_stack.pop(); }
        if (cc === 40) pd++;
        if (cc === 41) pd--;
    }

    // Print snapshot every 500 lines and at the end
    if ((li + 1) % 500 === 0 || li === lines.length - 1) {
        console.log('After line ' + (li + 1) + ': bd=' + bd + ' pd=' + pd);
    }
}

console.log('\nStack top 5:');
brace_stack.slice(-5).forEach(b => console.log('  Line ' + b.l + ': ' + b.ctx));
