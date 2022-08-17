# Vue-miga

Tool to migrate Vue 2 component from class component or option component to composition API.

After migrate to composition API, you could move to Vue 3 quite easily.

(ClassAPI | OptionAPI) => CompositionAPI


## Limitations
Built with many assumptions so there might be some cases that cannot fully migrate and need some manual jobs.


## Installation

Download the whole folder and run the below block. Remember to let `<THE_PATH_OF_MIGA>` point to the folder that this project is at
``` bash
export VUE_MIGA_HOME=<THE_PATH_OF_MIGA>
export PATH=$VUE_MIGA_HOME/bin:$PATH

cd $VUE_MIGA_HOME
chmod +x bin/miga
```

## Before using

This tool will emit code that use `@vue/composition-api` package, so your project need to have it before running this tool:

Install the `@vue/composition-api` package:
``` bash
npm install @vue/composition-api
```

Add `composition-api` to `main.ts`:
``` javascript
import Vue from 'vue'
import VueCompositionAPI from '@vue/composition-api'

Vue.use(VueCompositionAPI)
```

## Usages

Change dir your shell to the root folder of the project that you want to convert. Foreach file you want to migrate, run:
``` bash
miga <file_path>
```
