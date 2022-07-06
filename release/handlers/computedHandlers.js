"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computedAsObject = exports.computedAsCall = void 0;
const ts_morph_1 = require("ts-morph");
const helpers_1 = require("../helpers");
function computedAsCall(inputMapper) {
    const iComputed = inputMapper.computed;
    const calledName = iComputed.getFirstChild().getText();
    if (calledName === "mapState") {
        const argument = iComputed.getArguments()[0];
        argument.getProperties().forEach((prop) => {
            //Got the arrow function, solve the mixins to get it, or pass it.
            console.log(prop.getInitializer().print());
        });
    }
    else if (calledName === "mapGetters") {
    }
    return [];
}
exports.computedAsCall = computedAsCall;
function computedAsObject(inputMapper, outputMapper) {
    const iComputed = inputMapper.computed;
    const res = [];
    let body = {}, type = {};
    iComputed.getProperties().forEach((prop) => {
        var _a, _b;
        const name = prop.getFirstChild().getText();
        inputMapper.computedNames.push(name);
        switch (prop.getKind()) {
            case ts_morph_1.ts.SyntaxKind.MethodDeclaration:
                prop = prop;
                (0, helpers_1.processThisKeywordAccess)(prop, inputMapper, outputMapper);
                body = prop.getBody();
                type = (_a = prop.getReturnTypeNode()) === null || _a === void 0 ? void 0 : _a.getText();
                break;
            case ts_morph_1.ts.SyntaxKind.PropertyAssignment:
                //check if the property is arrow function or function expression
                const propBody = prop.getInitializer();
                (0, helpers_1.processThisKeywordAccess)(propBody, inputMapper, outputMapper);
                if (propBody.isKind(ts_morph_1.ts.SyntaxKind.ArrowFunction) || propBody.isKind(ts_morph_1.ts.SyntaxKind.FunctionExpression)) {
                    body = propBody.getBody();
                    type = (_b = propBody.getReturnTypeNode()) === null || _b === void 0 ? void 0 : _b.getText();
                }
                else
                    throw `computed key '${name}' is not a function`;
        }
        res.push(`const ${name} = computed${type ? `<${type}>` : ''}(()${type ? `: ${type}` : ''} => ${body.getText()})`);
    });
    return res;
}
exports.computedAsObject = computedAsObject;
//# sourceMappingURL=computedHandlers.js.map