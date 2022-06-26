import {MethodDeclaration, Node, ObjectLiteralExpression, PropertyAssignment, ReturnStatement, SourceFile, ts} from "ts-morph";
import {isEmpty} from "lodash";
import { OutputMapper } from "./models/mapperModel";

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
    const isData = inputMapper.dataProps.find(data => data.name === varName);
    const isComputed = inputMapper.computedNames.includes(varName);
    return isProp || isData || isComputed;
}

export function findExportNode(sf) {
    //find the main node
    const mainExport = sf.getExportAssignment(()=> true);
    return mainExport;
}

export function processThisKeywordAccess(method, inputMapper){
    method.getDescendantsOfKind(ts.SyntaxKind.ThisKeyword).forEach((thisKeyword) => {
        const par = thisKeyword.getParent();
        const thisAccessKey = par.getChildAtIndex(2).print();
        //replace if the accessing key is a data of component
        if (checkVarIsComponentData(thisAccessKey, inputMapper))
            par.replaceWithText(`${thisAccessKey}.value`);
        else
            //the accessing key is not data of component, could also be the argument of the function;
            par.replaceWithText(thisAccessKey);
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

export function copyObjectToProperyAssignment(source, target, targetKeyName: string): PropertyAssignment{
    let prop = (target as ObjectLiteralExpression).addPropertyAssignment({
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
        copyObjectValue(outputMapper, oldMapper);
    }
    return outputMapper;
}
