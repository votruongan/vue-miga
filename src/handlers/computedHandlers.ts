import { ts, SourceFile, ObjectBindingPattern, ReturnStatement, VariableDeclarationStructure, Node, FunctionExpression } from "ts-morph";
import { MethodDeclaration, ExportAssignment, CallExpression, ArrowFunction,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind} from "ts-morph";
import {processThisKeywordAccess} from "../helpers/common";
import { InputMapper, OutputMapper } from "../models/mapperModel";

export function computedAsCall(inputMapper: InputMapper): string[] {
    const iComputed = inputMapper.computed as CallExpression;
    const calledName = iComputed.getFirstChild().getText();
    if (calledName === "mapState"){
        const argument = (iComputed as CallExpression).getArguments()[0] as ObjectLiteralExpression;
        argument.getProperties().forEach((prop: PropertyAssignment) => {
            //Got the arrow function, solve the mixins to get it, or pass it.
            console.log(prop.getInitializer().print());
        })
    } else if (calledName === "mapGetters") {

    }
    return [];
}

export function computedAsObject(inputMapper: InputMapper, outputMapper: OutputMapper) {
    const iComputed = inputMapper.computed as ObjectLiteralExpression;
    const res = [];
    let body = {}, type = {};
    (iComputed as ObjectLiteralExpression).getProperties().forEach((prop) => {
        const name = prop.getFirstChild().getText()
        inputMapper.computedNames.push(name);
        switch (prop.getKind()){
            case ts.SyntaxKind.MethodDeclaration:
                prop = prop as MethodDeclaration;
                processThisKeywordAccess(prop, inputMapper, outputMapper);
                body = prop.getBody();
                type = prop.getReturnTypeNode()?.getText();
                break;
            case ts.SyntaxKind.PropertyAssignment:
                //check if the property is arrow function or function expression
                const propBody = (prop as PropertyAssignment).getInitializer() as Node;
                processThisKeywordAccess(propBody, inputMapper, outputMapper);
                if (propBody.isKind(ts.SyntaxKind.ArrowFunction) || propBody.isKind(ts.SyntaxKind.FunctionExpression)){
                    body = (propBody as FunctionExpression).getBody();
                    type = (propBody as FunctionExpression).getReturnTypeNode()?.getText();
                }
                else throw `computed key '${name}' is not a function`
        }
        res.push(`const ${name} = computed${type ? `<${type}>` : ''}(()${type ? `: ${type}`: ''} => ${(body as ts.Node).getText()})`)
    })
    return res;
}