// Набор фич framer-motion для LazyMotion. Лежит отдельным модулем, чтобы
// `import('./features')` в MotionRoot вынес domAnimation в свой чанк: он
// скачивается после гидрации и не входит в бандл страницы.
import { domAnimation } from 'framer-motion'

export default domAnimation
