"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParamsString = exports.getBlockFunctionName = exports.constructMainOutputMapper = exports.copyObjectValue = exports.addComment = exports.copyObjectToProperyAssignment = exports.getReturnedExpression = exports.isNodeEmpty = exports.processThisKeywordAccess = exports.initDeclareInSetup = exports.addImportToMapper = exports.findExportNode = exports.checkVarIsComponentData = exports.cloneObject = exports.findScriptContent = void 0;
const ts_morph_1 = require("ts-morph");
const lodash_1 = require("lodash");
const mapperModel_1 = require("./models/mapperModel");
function findScriptContent(vueComponentString) {
    const arr = vueComponentString.split("\n");
    let begin = 0, end = 0;
    for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s.includes(`<script`)) {
            begin = i;
        }
        else {
            if (s.includes(`</script>`)) {
                end = i;
                break;
            }
        }
    }
    return {
        content: arr.slice(begin + 1, end).join("\n"),
        startLine: begin,
        endLine: end,
    };
}
exports.findScriptContent = findScriptContent;
function cloneObject(sourceObject, targetObject) {
    targetObject.replaceWithText(sourceObject.print());
}
exports.cloneObject = cloneObject;
function checkVarIsComponentData(varName, inputMapper, methodArguments) {
    if (methodArguments === null || methodArguments === void 0 ? void 0 : methodArguments.includes(varName))
        return false;
    const isProp = inputMapper.propNames.includes(varName);
    const isData = inputMapper.dataProps.find((data) => data.getName() === varName);
    const isComputed = inputMapper.computedNames.includes(varName);
    return isProp || isData || isComputed;
}
exports.checkVarIsComponentData = checkVarIsComponentData;
function findExportNode(sf) {
    //find the main node
    const mainExport = sf.getExportAssignment(() => true);
    return mainExport;
}
exports.findExportNode = findExportNode;
function addImportToMapper(outputMapper, importFile, importedVar) {
    if (!outputMapper.otherImports[importFile])
        outputMapper.otherImports[importFile] = {};
    if (importedVar.defaultImport)
        outputMapper.otherImports[importFile].defaultImport = importedVar.defaultImport;
    if (importedVar.namedImportsArray) {
        if (!outputMapper.otherImports[importFile].namedImports)
            outputMapper.otherImports[importFile].namedImports = new Set();
        importedVar.namedImportsArray.forEach(imp => outputMapper.otherImports[importFile].namedImports.add(imp));
    }
}
exports.addImportToMapper = addImportToMapper;
const declaredIdentifier = {};
function initDeclareInSetup(outputMapper, declareName, initializer) {
    if (declaredIdentifier[declareName])
        return;
    declaredIdentifier[declareName] = true;
    const oSetup = outputMapper.setup;
    oSetup.addVariableStatement({
        declarationKind: ts_morph_1.VariableDeclarationKind.Const,
        declarations: [{ name: declareName, initializer }]
    }).setOrder(2);
}
exports.initDeclareInSetup = initDeclareInSetup;
function processThisKeywordAccess(method, inputMapper, outputMapper) {
    method.getDescendantsOfKind(ts_morph_1.ts.SyntaxKind.ThisKeyword).forEach((thisKeyword) => {
        const par = thisKeyword.getParent();
        const thisAccessKey = par.getChildAtIndex(2).print();
        //replace if the accessing key is a data of component
        if (checkVarIsComponentData(thisAccessKey, inputMapper))
            par.replaceWithText(`${thisAccessKey}.value`);
        else {
            switch (thisAccessKey) {
                case '$lang':
                    par.replaceWithText(`lang`);
                    outputMapper && addImportToMapper(outputMapper, `@/lang/lang`, { defaultImport: `lang` });
                    break;
                case '$router':
                    par.replaceWithText(`vRouter`);
                    initDeclareInSetup(outputMapper, 'vRouter', 'useRouter()');
                    outputMapper && addImportToMapper(outputMapper, `@/composables/root`, { namedImportsArray: [`useRouter`] });
                    break;
                case '$emit':
                    const emitEvent = par.getParent().getArguments()[0];
                    par.replaceWithText(`context.emit`);
                    inputMapper.emitsNames.add(emitEvent.getLiteralText ? emitEvent.getLiteralText() : emitEvent.getText());
                    break;
                case '$refs':
                    const refAccessNode = par.getParent().getChildAtIndex(2);
                    const refAccess = refAccessNode.getLiteralText ? refAccessNode.getLiteralText() : refAccessNode.getText();
                    inputMapper.refsNames.add(refAccess);
                    par.getParent().replaceWithText(`(${refAccess}.value as HTMLElement)`);
                    break;
                default:
                    //the accessing key is not data of component, could also be the argument of the function;
                    par.replaceWithText(thisAccessKey);
            }
        }
    });
}
exports.processThisKeywordAccess = processThisKeywordAccess;
function isNodeEmpty(node) {
    if (!(node === null || node === void 0 ? void 0 : node.print))
        return true;
    try {
        return (0, lodash_1.isEmpty)(JSON.parse(node.print()));
    }
    catch (e) {
        return false;
    }
}
exports.isNodeEmpty = isNodeEmpty;
function getReturnedExpression(node) {
    if (!(node === null || node === void 0 ? void 0 : node.getFirstDescendantByKind))
        return null;
    const returnStatement = node.getFirstDescendantByKind(ts_morph_1.ts.SyntaxKind.ReturnStatement);
    if (!returnStatement)
        return null;
    return returnStatement.getExpression();
}
exports.getReturnedExpression = getReturnedExpression;
function copyObjectToProperyAssignment(source, target, targetKeyName) {
    let prop = target.addPropertyAssignment({
        name: targetKeyName,
        initializer: '{}'
    });
    prop.replaceWithText(`${targetKeyName}: ${source.getText()}`);
    return prop;
}
exports.copyObjectToProperyAssignment = copyObjectToProperyAssignment;
function addComment(outputFile, startPos, comment, outputMapper) {
    const pos = startPos.getStartLinePos ? startPos.getStartLinePos() : startPos;
    outputFile.insertText(pos, `//${comment}\n`);
    // Re-construct the output mapper as the old mapper is forgot when call insert tetxt;
    constructMainOutputMapper(outputFile, outputMapper);
}
exports.addComment = addComment;
function copyObjectValue(sourceObject, applyObject) {
    Object.keys(applyObject).forEach(key => {
        applyObject[key] = sourceObject[key];
    });
}
exports.copyObjectValue = copyObjectValue;
function constructMainOutputMapper(outputFile, oldMapper) {
    const outputMapper = new mapperModel_1.OutputMapper();
    const templateObject = findExportNode(outputFile).getExpression().getArguments()[0];
    outputMapper.exportedObject = templateObject;
    outputMapper.setup = templateObject.getProperty("setup");
    outputMapper.components = templateObject.getProperty("components").getInitializer();
    outputMapper.props = templateObject.getProperty("props").getInitializer();
    if (oldMapper) {
        outputMapper.newCompositionImports = oldMapper.newCompositionImports;
        outputMapper.otherImports = oldMapper.otherImports;
        copyObjectValue(outputMapper, oldMapper);
    }
    return outputMapper;
}
exports.constructMainOutputMapper = constructMainOutputMapper;
// get the function name of the block
function getBlockFunctionName(block) {
    let parent = block.getParent().getName ? block.getParent() : block.getParent().getParent();
    return parent.getName ? parent : null;
}
exports.getBlockFunctionName = getBlockFunctionName;
function getParamsString(method) {
    return method.getParameters().map(p => {
        const pType = p.getTypeNode();
        return `${p.getName()}: ${pType ? pType.getText() : 'any'}`;
    }).join(', ');
}
exports.getParamsString = getParamsString;
//# sourceMappingURL=helpers.js.map