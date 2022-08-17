import { ArrayLiteralExpression, CallExpression, ClassDeclaration, FunctionTypeNode, ObjectLiteralExpression, PropertyAssignment, SpreadAssignment, StringLiteral, ts } from "ts-morph";
import { normalizedSpeadAssignmentCallArg1 } from "../../helpers/classDecoratorMappingHelper";
import { getParamsString, getStringLiteralValue } from "../../helpers/common";

export default function mapMethodInDecorator(methodObjectInDecorator: ObjectLiteralExpression, newMethodsObject: ObjectLiteralExpression, mainClass: ClassDeclaration){
    methodObjectInDecorator.getProperties().forEach(p => {
        switch (p.getKind()) {
            // handle ... (spread assignment)
            case ts.SyntaxKind.SpreadAssignment:
                const call = (p as SpreadAssignment).getExpressionIfKind(ts.SyntaxKind.CallExpression);
                spreadAssignmentHandler(call, newMethodsObject, mainClass);
                break;
            // method and arrow function props
            default:
                
        }
    })
}

function spreadAssignmentHandler(call: CallExpression, newMethodsObject: ObjectLiteralExpression, mainClass: ClassDeclaration) {
    const callName = call.getExpression().print();
    const callArgs = call.getArguments();
    const storeName = getStringLiteralValue(callArgs[0].getFullText());
    const methodToStoreActionMapper = normalizedSpeadAssignmentCallArg1(callArgs[1] as ObjectLiteralExpression);
    const methodsDataKeys = Object.keys(methodToStoreActionMapper);

    if (!storeName) return;
    //loop through the ... and create new computed
    methodsDataKeys.forEach(key => {
        const name = getStringLiteralValue(key);
        const typeNode = mainClass.getProperty(name).getTypeNode();
        if (!typeNode.isKind(ts.SyntaxKind.FunctionType)){
            console.log(`/!\\ Warning: method ${name} type is not a function type`)
        }
        const methodFullParamString = (typeNode as FunctionTypeNode).getParameters().map(param => param.print()).join(', ');
        const methodParamNames = (typeNode as FunctionTypeNode).getParameters().map(param => param.getName());
        const methodReturnedType = (typeNode as FunctionTypeNode).getReturnTypeNode().getText();
        const newMethod = newMethodsObject.addMethod({ name });
        // const paramsString = getParamsString(type as any);
        // begin of the function body. Eg: "foo (): BarType { "
        let methodBodyString = `${name} (${methodFullParamString})${methodReturnedType ? `: ${methodReturnedType}` : 'any'} {\n`
        // handle for ...mapMutations case
        if (callName === 'mapMutations'){
            methodBodyString += `return this.$store.commit('${storeName}/${methodToStoreActionMapper[key]}'${methodParamNames.length > 0 ? `, ${methodParamNames[0]}` : ''});`
        }
        //TODO: handle for ...mapActions case
        else if (callName === 'mapActions'){
            methodBodyString += `return this.$store.dispatch('${storeName}/${methodToStoreActionMapper[key]}', );`
        }
        newMethod.replaceWithText(methodBodyString + '\n}');
    })
}