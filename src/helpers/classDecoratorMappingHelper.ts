import { ArrayLiteralExpression, ObjectLiteralExpression, PropertyAssignment, StringLiteral, ts } from "ts-morph";
import { getStringLiteralValue } from "./common";

export function normalizedSpeadAssignmentCallArg1(getNames: ObjectLiteralExpression | ArrayLiteralExpression){
    const dataToStoreValueMapper = {}
    // normalize 2 case mapstate('abc', { a: 'def' }) and mapstate('abc', ['def'])
    if (getNames.isKind(ts.SyntaxKind.ObjectLiteralExpression)){
        getNames.getProperties().forEach((prop: PropertyAssignment) => {
            dataToStoreValueMapper[prop.getName()] = getStringLiteralValue(prop.getInitializer() as StringLiteral);
        })
    } else {
        (getNames as ArrayLiteralExpression).getElements().forEach(e => {
            dataToStoreValueMapper[e.print()] = getStringLiteralValue(e as StringLiteral);
        })
    }
    return dataToStoreValueMapper;
}