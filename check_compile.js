const fs = require('fs');
const vm = require('vm');

try {
    const code = fs.readFileSync('app.js', 'utf8');
    new vm.Script(code);
    console.log("Compile OK!");
} catch (e) {
    console.error("Compile FAILED:");
    console.error(e.stack);
}
