import { ts, SourceFile, ObjectBindingPattern, ReturnStatement, VariableDeclarationStructure } from "ts-morph";
import { MethodDeclaration, ExportAssignment, CallExpression, ArrowFunction,
        ObjectLiteralExpression, PropertyAssignment, VariableDeclarationKind} from "ts-morph";
import {processThisKeywordAccess} from "../helpers";
import { InputMapper } from "../models/mapperModel";

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

export function computedAsObject(inputMapper: InputMapper) {
    const iComputed = inputMapper.computed as ObjectLiteralExpression;
    const res = [];
    let body = {};
    (iComputed as ObjectLiteralExpression).getProperties().forEach((prop) => {
        const name = prop.getFirstChild().getText()
        inputMapper.computedNames.push(name);
        switch (prop.getKind()){
            case ts.SyntaxKind.MethodDeclaration:
                processThisKeywordAccess(prop as MethodDeclaration, inputMapper);
                body = (prop as MethodDeclaration).getBody();
                break;
            case ts.SyntaxKind.PropertyAssignment:
                const propBody = prop.getChildAtIndex(2);
                processThisKeywordAccess(propBody as MethodDeclaration, inputMapper);
                if (propBody.getKind() === ts.SyntaxKind.ArrowFunction)
                    body = (propBody as ArrowFunction).getBody();
                else throw `computed key '${name}' is not a function`
        }
        res.push(`const ${name} = computed(() => ${(body as ts.Node).getText()})`)
    })
    return res;
}