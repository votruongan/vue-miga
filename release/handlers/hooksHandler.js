"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const consts_1 = require("../consts");
const helpers_1 = require("../helpers");
function handleHooks(inputMapper, outputMapper) {
    const oSetup = outputMapper.setup;
    const iCreated = inputMapper.created;
    const hookStrings = [];
    if (!(0, helpers_1.isNodeEmpty)(iCreated)) {
        hookStrings.push(`${iCreated.getChildren()[1].getText()}`);
    }
    let exp = '', hookName = '';
    for (let key of Object.keys(inputMapper)) {
        hookName = consts_1.AVAILABLE_HOOKS.find((h) => h.toLowerCase() === key.toLowerCase());
        if (hookName) {
            const body = inputMapper[key];
            if ((0, helpers_1.isNodeEmpty)(body))
                continue;
            hookName = `on${hookName}`;
            outputMapper.newCompositionImports.push(hookName);
            exp = `${hookName}(() => ${body.print()})`;
            hookStrings.push(exp);
        }
    }
    const statements = oSetup.addStatements(hookStrings);
    //clean this keywords from statements
    statements.forEach((statement) => {
        (0, helpers_1.processThisKeywordAccess)(statement, inputMapper);
    });
}
exports.default = handleHooks;
//# sourceMappingURL=hooksHandler.js.map