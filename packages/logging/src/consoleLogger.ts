import kleur from 'kleur';

export function log(message: string, color: 'red' | 'blue' | 'cyan' | 'green') {
    let colored;

    switch (color) {
        case 'red':
            colored = kleur.red(message);
            break;
        case 'blue':
            colored = kleur.blue(message);
            break;
        case 'cyan':
            colored = kleur.cyan(message);
            break;
        case 'green':
            colored = kleur.green(message);
            break;
    }

    console.log(colored);
}

export const SECTION_DIVIDER = '###########################################';
export const SECTION_WRAPPER = '#####################';

export function logInfo(message: string) {
    console.log(kleur.blue(message));
}

export function logError(message: string, error?: unknown) {
    let errorTxt;

    if (!error) {
        errorTxt = '';
    } else if (typeof error === 'undefined') {
        errorTxt = 'UNDEFINED ERROR';
    } else if (error instanceof Error) {
        errorTxt = error.message;
    } else if (typeof error === 'object') {
        errorTxt = JSON.stringify(error);
    } else if (typeof error === 'string') {
        errorTxt = error;
    } else if (typeof error === 'number') {
        errorTxt = error;
    } else {
        errorTxt = JSON.stringify(error);
    }

    console.log(kleur.red(`${message}: ${errorTxt}`));
}

export function logDivider() {
    console.log(kleur.cyan(SECTION_DIVIDER));
}

export function logSection(message: string) {
    const length = message.length;
    const padding = new Array(length + 2).fill('#').join('');

    console.log(kleur.cyan(`\n${SECTION_WRAPPER}${padding}${SECTION_WRAPPER}`));
    console.log(kleur.cyan(`${SECTION_WRAPPER} ${kleur.blue(message)} ${SECTION_WRAPPER}`));
    console.log(kleur.cyan(`${SECTION_WRAPPER}${padding}${SECTION_WRAPPER}\n`));
}

export function logSubSection(message: string) {
    console.log(kleur.cyan(`====== ${kleur.blue(message)} ======`));
}
