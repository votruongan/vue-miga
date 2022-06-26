import { Project, ScriptTarget } from "ts-morph";
import { findScriptContent } from "./helpers"
import { readFileSync, writeFileSync } from "fs";
import makeVue3CodeFromVue2Export from "./handlers/baseHandlers";
import process from "process";
import fs from "fs";
import path from "path";

if (require.main === module) {
    try{  
        main();
    } catch (e) {
        console.log(e);
    }
}

function main() {
    const {projectPath, inputFilePath} = processCLIEnvironment(process);
    const project = new Project({
        compilerOptions: {
            target: ScriptTarget.ES2015,
        },
        tsConfigFilePath: projectPath + "/tsconfig.json",
    });
    project.addSourceFilesAtPaths("output_templates/*.template");
    
    let fileContent = readFileSync(inputFilePath, { encoding: "utf-8" });
    const {content, startLine, endLine} = findScriptContent(fileContent);

    project.createSourceFile("./tmp.tscontent", content);
    
    const appNode = project.getSourceFile("./tmp.tscontent");
    const template = project.getSourceFile("output_templates/output_vue2_composition.template");
    
    const scriptContent = makeVue3CodeFromVue2Export(appNode, template);

    console.log(' - writing output');
    const upContent = fileContent.split('\n').slice(0, startLine).join('\n');
    const lowContent = fileContent.split('\n').slice(endLine).join('\n');

    fileContent = upContent + 
                '\n<script lang="ts">\n'+
                scriptContent + lowContent;

    writeFileSync(inputFilePath, fileContent);
    // console.log(scriptContent);
}

function processCLIEnvironment(process: NodeJS.Process){
    const projectPath = process.cwd(), input = process.argv[2];
    if (!input || !input.length)
        throw "ERROR: No input file provided."
    const inputFilePath = path.isAbsolute(input)? input : path.resolve(input);
    if (!fs.existsSync(projectPath + "/tsconfig.json"))
        console.log(`/!\\ No tsconfig file found.`)
    if (!inputFilePath || !fs.existsSync(inputFilePath))
        throw `ERROR: File '${inputFilePath}' is not existing`
    process.chdir(process.env.VUE_MIGA_HOME)
    return {  projectPath, inputFilePath, }
}