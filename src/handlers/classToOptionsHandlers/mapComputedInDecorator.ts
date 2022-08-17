import { ArrayLiteralExpression, CallExpression, ClassDeclaration, ObjectLiteralExpression, PropertyAssignment, SpreadAssignment, StringLiteral, ts } from "ts-morph";
import { normalizedSpeadAssignmentCallArg1 } from "../../helpers/classDecoratorMappingHelper";
import { getStringLiteralValue } from "../../helpers/common";

export default function mapComputedInDecorator(existingComputedObject: ObjectLiteralExpression, newComputedObject: ObjectLiteralExpression, mainClass: ClassDeclaration){
    existingComputedObject.getProperties().forEach(p => {
        switch (p.getKind()) {
            // handle ... (spread assignment)
            case ts.SyntaxKind.SpreadAssignment:
                const call = (p as SpreadAssignment).getExpressionIfKind(ts.SyntaxKind.CallExpression);
                spreadAssignmentHandler(call, newComputedObject, mainClass);
                break;
            // method and arrow function props
            default:
                
        }
    })
}

function spreadAssignmentHandler(call: CallExpression, newComputedObject: ObjectLiteralExpression, mainClass: ClassDeclaration) {
    const callName = call.getExpression().print();
    const callArgs = call.getArguments();
    const storeName = getStringLiteralValue(callArgs[0].getFullText());
    const dataToStoreValueMapper = normalizedSpeadAssignmentCallArg1(callArgs[1] as ObjectLiteralExpression);
    const computedDataKeys = Object.keys(dataToStoreValueMapper);

    if (!storeName) return;
    //loop through the ... and create new computed
    computedDataKeys.forEach(key => {
        const name = getStringLiteralValue(key);
        const type = mainClass.getProperty(name).getTypeNode().getText();
        const newMethod = newComputedObject.addMethod({ name })
        // begin of the function body. Eg: "foo (): BarType { "
        let methodBodyString = `${name} ()${type ? `: ${type}` : ''} {\n`
        // handle for ...mapState case
        if (callName === 'mapState'){
            methodBodyString += `return this.$store.state['${storeName}']['${dataToStoreValueMapper[key]}'];`
        }
        //TODO: handle for ...mapGetters case
        else if (callName === 'mapGetters'){
            methodBodyString += `return this.$store.getters['${storeName}/${dataToStoreValueMapper[key]}'];`
        }
        newMethod.replaceWithText(methodBodyString + '\n}');
    })
}