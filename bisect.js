const fs = require('fs');
const vm = require('vm');

// Write a bisect check script that splits file and checks each half
const code = fs.readFileSync('app.js', 'utf8');
const lines = code.split('\n');

// Try progressively smaller chunks from the end to find where the error first appears
for (let end = lines.length; end > 0; end -= 200) {
    const chunk = lines.slice(0, end).join('\n');
    try {
        new vm.Script(chunk);
        console.log(`Parsed OK up to line ${end}`);
        break;
    } catch(e) {
        console.log(`Error at chunk ending at line ${end}: ${e.message}`);
    }
}
