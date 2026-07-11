const fs = require('fs');
const code = fs.readFileSync('app.js', 'utf8');

let stack = [];
let lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    for (let j = 0; j < line.length; j++) {
        let char = line[j];
        if (char === '{' || char === '(') {
            stack.push({ char, line: i + 1, col: j + 1 });
        } else if (char === '}') {
            if (stack.length === 0) {
                console.log(`Unmatched } at line ${i + 1}, col ${j + 1}`);
            } else {
                let last = stack.pop();
                if (last.char !== '{') {
                    console.log(`Mismatched } matching ${last.char} from line ${last.line}, col ${last.col} at line ${i + 1}, col ${j + 1}`);
                }
            }
        } else if (char === ')') {
            if (stack.length === 0) {
                console.log(`Unmatched ) at line ${i + 1}, col ${j + 1}`);
            } else {
                let last = stack.pop();
                if (last.char !== '(') {
                    console.log(`Mismatched ) matching ${last.char} from line ${last.line}, col ${last.col} at line ${i + 1}, col ${j + 1}`);
                }
            }
        }
    }
}

console.log(`Remaining unclosed: ${stack.length}`);
if (stack.length > 0) {
    console.log("Unclosed stack:");
    console.log(stack);
}
