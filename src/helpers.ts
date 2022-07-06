import {ArrowFunction, CallExpression, FunctionDeclaration, FunctionExpression, GetAccessorDeclaration, MethodDeclaration, Node, ObjectLiteralExpression, PropertyAssignment, ReturnStatement, SourceFile, StringLiteral, ts, VariableDeclarationKind} from "ts-morph";
import {isEmpty} from "lodash";
import { InputMapper, OutputMapper } from "./models/mapperModel";
import { ImportPayload } from "./models/payload";

export function findScriptContent(vueComponentString) {
    const arr = vueComponentString.split("\n");
    let begin = 0, end = 0;
    for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s.includes(`<script`)){
            begin = i;
        }
        else {
            if (s.includes(`</script>`)){
                end = i;break;
            }
        }
    }
    return {
        content: arr.slice(begin + 1, end).join("\n"),
        startLine: begin,
        endLine: end,
    }
}

export function cloneObject(sourceObject: any, targetObject: any) {
    targetObject.replaceWithText(sourceObject.print());
}

export function checkVarIsComponentData(varName: string, inputMapper: Record<string, any>, methodArguments?: string[]): boolean {
    if (methodArguments?.includes(varName))
        return false;
    const isProp = inputMapper.propNames.includes(varName);
    const isData = inputMapper.dataProps.find((data: PropertyAssignment) => data.getName() === varName);
    const isComputed = inputMapper.computedNames.includes(varName);
    return isProp || isData || isComputed;
}

export function findExportNode(sf) {
    //find the main node
    const mainExport = sf.getExportAssignment(()=> true);
    return mainExport;
}

export function addImportToMapper(outputMapper: OutputMapper, importFile: string, importedVar: ImportPayload){
    if (!outputMapper.otherImports[importFile])
        outputMapper.otherImports[importFile] = {}
    if (importedVar.defaultImport)
        outputMapper.otherImports[importFile].defaultImport = importedVar.defaultImport;
    if (importedVar.namedImportsArray){
        if (!outputMapper.otherImports[importFile].namedImports)
            outputMapper.otherImports[importFile].namedImports = new Set<string>();
        importedVar.namedImportsArray.forEach(imp => outputMapper.otherImports[importFile].namedImports.add(imp));
    }
}

const declaredIdentifier: Record<string, boolean> = {};
export function initDeclareInSetup(outputMapper: OutputMapper, declareName: string, initializer: string){
    if (declaredIdentifier[declareName]) return;
    declaredIdentifier[declareName] = true;
    const oSetup = (outputMapper.setup as MethodDeclaration);
    oSetup.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations:[{name: declareName, initializer}]
    }).setOrder(2);
}

export function processThisKeywordAccess(method, inputMapper: InputMapper, outputMapper?: OutputMapper){
    method.getDescendantsOfKind(ts.SyntaxKind.ThisKeyword).forEach((thisKeyword) => {
        const par = thisKeyword.getParent();
        const thisAccessKey = par.getChildAtIndex(2).print();
        //replace if the accessing key is a data of component
        if (checkVarIsComponentData(thisAccessKey, inputMapper))
            par.replaceWithText(`${thisAccessKey}.value`);
        else{
            switch (thisAccessKey){
                case '$lang':
                    par.replaceWithText(`lang`);
                    outputMapper && addImportToMapper(outputMapper, `@/lang/lang`, {defaultImport: `lang`})
                    break;
                case '$router':
                    par.replaceWithText(`vRouter`);
                    initDeclareInSetup(outputMapper, 'vRouter', 'useRouter()')
                    outputMapper && addImportToMapper(outputMapper, `@/composables/root`, {namedImportsArray: [`useRouter`]})
                    break;
                case '$emit':
                    const emitEvent = (par.getParent() as CallExpression).getArguments()[0] as StringLiteral;
                    par.replaceWithText(`context.emit`);
                    inputMapper.emitsNames.add(emitEvent.getLiteralText ? emitEvent.getLiteralText() : emitEvent.getText());
                    break;
                case '$refs':
                    const refAccessNode = par.getParent().getChildAtIndex(2);
                    const refAccess: string = refAccessNode.getLiteralText ? refAccessNode.getLiteralText() : refAccessNode.getText();
                    inputMapper.refsNames.add(refAccess);
                    par.getParent().replaceWithText(`(${refAccess}.value as HTMLElement)`)
                    break;
                default:
                    //the accessing key is not data of component, could also be the argument of the function;
                    par.replaceWithText(thisAccessKey);
            }
        }
    })
}

export function isNodeEmpty(node){
    if (!node?.print) return true;
    try {
        return isEmpty(JSON.parse(node.print()));
    } catch (e) {
        return false;
    }
}

export function getReturnedExpression(node) {
    if (!node?.getFirstDescendantByKind) return null;
    const returnStatement = node.getFirstDescendantByKind(ts.SyntaxKind.ReturnStatement);
    if (!returnStatement) return null;
    return (returnStatement as ReturnStatement).getExpression();
}

export function copyObjectToProperyAssignment(source, target: ObjectLiteralExpression, targetKeyName: string): PropertyAssignment{
    let prop = target.addPropertyAssignment({
        name: targetKeyName, 
        initializer: '{}'
    })
    prop.replaceWithText(`${targetKeyName}: ${source.getText()}`)
    return prop
}

export function addComment(outputFile: SourceFile, startPos: number | Node, comment: string, outputMapper: OutputMapper): void {
    const pos = (startPos as Node).getStartLinePos ? (startPos as Node).getStartLinePos() : startPos as number;
    outputFile.insertText(pos, `//${comment}\n`);
    // Re-construct the output mapper as the old mapper is forgot when call insert tetxt;
    constructMainOutputMapper(outputFile, outputMapper);
}

export function copyObjectValue(sourceObject, applyObject){
    Object.keys(applyObject).forEach(key => {
        applyObject[key] = sourceObject[key];
    })
}

export function constructMainOutputMapper(outputFile: SourceFile, oldMapper?: OutputMapper){
    const outputMapper = new OutputMapper();
    const templateObject = findExportNode(outputFile).getExpression().getArguments()[0] as ObjectLiteralExpression;
    outputMapper.exportedObject = templateObject;
    outputMapper.setup = templateObject.getProperty("setup") as MethodDeclaration;
    outputMapper.components = (templateObject.getProperty("components") as PropertyAssignment).getInitializer();
    outputMapper.props = (templateObject.getProperty("props")as PropertyAssignment).getInitializer();
    if (oldMapper){
        outputMapper.newCompositionImports = oldMapper.newCompositionImports;
        outputMapper.otherImports = oldMapper.otherImports;
        copyObjectValue(outputMapper, oldMapper);
    }
    return outputMapper;
}

// get the function name of the block
export function getBlockFunctionName(block) {
    let parent = block.getParent().getName ? block.getParent() : block.getParent().getParent();
    return (parent as MethodDeclaration).getName ? parent : null;
}

export function getParamsString(method: MethodDeclaration | ArrowFunction | FunctionExpression | FunctionDeclaration | GetAccessorDeclaration): string {
    return method.getParameters().map(p => p.print()).join(', ');
}