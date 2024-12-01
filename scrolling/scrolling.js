/**
 * Scrolling - плавная прокрутка с произвольным шагом
 * Version 1.1
 * Arigato Software, 2024
 */

/*
!!! В файл app.json в параметр "permissions" добавить "data:os.device.info"

const scrolling = new Scrolling(params = {}) - создание прокрутки

params:
    mode: SCROLL_MODE_HORIZONTAL | SCROLL_MODE_VERTICAL - направление прокрутки (SCROLL_MODE_HORIZONTAL, SCROLL_MODE_VERTICAL)
    step_x: 1 - шаг прокрутки по горизонтали
    step_y: 1 - шаг прокрутки по вертикали
    k_braking: 0.9 - коэффициент торможения (0..1)
    finishing_speed: 8 - скорость доводки до заданного шага
    container: {} - параметры контейнера
    scroll_frame_func: null - callback(info) функция, вызываемая на каждый кадр прокрутки
    scroll_complete_func: null - callback(info) функция, вызываемая при завершении прокрутки
    gesture_func: null - callback(event) функция обработки свайпов (за пределами контейнера для прокрутки)

info:
    x - смещение контейнера по горизонтали
    y - смещение контейнера по вертикали

container:
    x: 0 - координата x контейнера
    y: 0 - координата y контейнера
    w: width - ширина контейнера
    h: height - высота контейнера
    pos_x: 0 - базовое смещение контейнера по горизонтали
    pos_y: 0 - базовое смещение контейнера по вертикали

scrolling.container - прокручиваемый контейнер, на нем необходимо разместить все элементы
scrolling.setScrolling(element) - сделать элемент перетаскиваемым (применить для каждого элемента на контейнере)
scrolling.getScrollStep(): result - получить текущую позицию прокрутки (в шагах): result.sx, result.sy
scrolling.stepTo(option) - прокрутка на заданное число шагов (option.kx < 0 - влево; option.kx > 0 - вправо; option.ky < 0 - вверх; option.ky > 0 - вниз)
scrolling.scrollTo(option) - прокрутка на заданную позицию (option.sx, option.sy), option.anim - анимация (true, false)
*/

import { createWidget, widget, event, prop } from '@zos/ui'
import { onGesture } from '@zos/interaction'
import { getDeviceInfo } from '@zos/device'

export const SCROLL_MODE_HORIZONTAL = 1;
export const SCROLL_MODE_VERTICAL = 2;

export class Scrolling {

    constructor(params = {}) {
        this.params = {
            mode: SCROLL_MODE_HORIZONTAL | SCROLL_MODE_VERTICAL,
            step_x: 1,
            step_y: 1,
            finishing_speed: 8,
            k_braking: 0.9,
            scroll_frame_func: null,
            scroll_complete_func: null,
            gesture_func: null,
            ...params,
        };
        this.down = false; // Флаг нажатия по экрану
        this.scrolling = false; // Флаг процесса прокрутки
        this.k = [0, 0]; // Направление смещения контейнера
        this.xy = [0, 0];
        this.dir = [SCROLL_MODE_HORIZONTAL, SCROLL_MODE_VERTICAL];
        this.step = [this.params.step_x, this.params.step_y]
        this.finish = [0, 0];
        this.timer = null; // Таймер торможения
        this.createContainer();
        this.blockGesture();
    }

    // Создание контейнера
    createContainer() {
        // Чтение параметров
        const { width, height } = getDeviceInfo();
        const params = {
            x: 0,
            y: 0,
            w: width,
            h: height,
            pos_x: 0,
            pos_y: 0,
            scroll_enable: false,
            ...(this.params.container ? this.params.container : {})
        };
        this.pos = [params.pos_x, params.pos_y];
        this.max = [params.w - width, params.h - height];

        // Создание контейнера
        this.container = createWidget(widget.VIEW_CONTAINER, params);

        // Создание прямоугольника, за который можно будет перетаскивать контейнер
        const rect = this.container.createWidget(widget.STROKE_RECT, {
            x: 0,
            y: 0,
            w: params.w,
            h: params.h,
            radius: 0,
            alpha: 0,
            color: 0x000000,
        });
        this.setScrolling(rect); // Чтобы за данный элемент можно было тянуть контейнер
    }

    // Блокировка свайпов
    blockGesture() {
        onGesture({
            callback: (event) => {
                if (this.scrolling) {
                    return true
                } else {
                    return this.params?.gesture_func(event);
                }
            },
        });
    }

    // Получить текущую позицию прокрутки (в шагах)
    getScrollStep() {
        return {
            sx: -Math.floor(this.pos[0] / this.step[0]),
            sy: -Math.floor(this.pos[1] / this.step[1]),
        };
    }

    // Прокрутка на заданное число шагов
    stepTo(option) {
        this.base = [-(option.kx ?? 0), -(option.ky ?? 0)];
        if (this.base[0] == 0 && this.base[1] == 0) return;
        this.dir.forEach((dir, i) => {
            if (this.params.mode & dir) {
                this.pos[i] += Math.sign(this.base[i]);
            }
        });
        this.scrolling = false;
        this.finishing([Math.round(Math.abs(this.base[0])), Math.round(Math.abs(this.base[1]))]);
    }

    // Прокрутка на заданную позицию
    scrollTo(option) {
        const current = this.getScrollStep();
        const to = [option.sx ?? current.sx, option.sy ?? current.sy];
        if (option.anim ?? false){
            this.stepTo({ kx: to[0] - current.sx, ky: to[1] - current.sy });
        } else {
            this.dir.forEach((dir, i) => {
                if (this.params.mode & dir) {
                    this.pos[i] = -to[i] * this.step[i];
                }
            });
            this.posContainer();
        }
    }

    // Обработка событий перемещения по экрану
    setScrolling(element) {
        element.addEventListener(event.CLICK_DOWN, (info) => this.onClickDown(info));
        element.addEventListener(event.CLICK_UP, (info) => this.onClickUp(info));
        element.addEventListener(event.MOVE, (info) => this.onMove(info));
    }

    // Обработчик нажатия на экран
    onClickDown(info) {
        this.xy = [info.x, info.y];
        this.down = true;
    }

    // Обработчик отпускания экрана
    onClickUp(info) {
        if (!this.scrolling) return;
        this.down = false;
        this.braking();
    }

    // Обработчик перемещения по экрану
    onMove(info) {
        if (!this.down) return;
        this.scrolling = true;
        this.k = [info.x - this.xy[0], info.y - this.xy[1]];
        this.xy = [info.x, info.y];
        this.move();
    }

    // Переместить контейнер в позицию this.pos
    posContainer(){
        this.container.setProperty(prop.MORE, { pos_x: this.pos[0], pos_y: this.pos[1] });
    }

    // Перемещение контейнера
    move() {
        this.dir.forEach((dir, i) => {
            if (this.params.mode & dir) {
                this.move_xy(i);
            }
        });
        this.posContainer();
        this.params.scroll_frame_func?.({ x: this.pos[0], y: this.pos[1] });
    }

    // Перемещение
    move_xy(i) {
        this.pos[i] += this.k[i];
        if (this.pos[i] > this.step[i]) {
            this.pos[i] = this.step[i];
            this.k[i] = 0;
        }
        if (this.pos[i] < -this.max[i] - this.step[i]) {
            this.pos[i] = -this.max[i] - this.step[i];
            this.k[i] = 0;
        }
    }

    // Эффект торможения
    braking() {
        if (this.timer) clearInterval(this.timer);
        this.base = [...this.k];
        this.timer = setInterval(() => {
            this.k[0] = Math.trunc(this.k[0] * this.params.k_braking);
            this.k[1] = Math.trunc(this.k[1] * this.params.k_braking);
            if (Math.abs(this.k[0]) <= this.params.finishing_speed && Math.abs(this.k[1]) <= this.params.finishing_speed) {
                this.finishing();
            } else {
                this.move();
            }
        }, 0);
    }

    // Доводка прокрутки под заданный шаг
    finishing(sxy = [1, 1]) {
        if (this.timer) clearInterval(this.timer);

        this.dir.forEach((dir, i) => {
            if (this.params.mode & dir) {
                this.finish[i] = Math.floor(this.pos[i] / this.step[i] + (this.base[i] > 0 ? sxy[i] : -sxy[i] + 1)) * this.step[i];
                if (this.pos[i] <= -this.max[i] || this.finish[i] < -this.max[i]) this.finish[i] = -this.max[i];
                if (this.pos[i] >= 0 || this.finish[i] > 0) this.finish[i] = 0;
                this.k[i] = this.params.finishing_speed * Math.sign(this.finish[i] - this.pos[i]);
            } else {
                this.k[i] = 0;
            }
        });

        this.timer = setInterval(() => {
            this.dir.forEach((dir, i) => {
                if (this.params.mode & dir) {
                    if (Math.abs(this.pos[i] - this.finish[i]) < this.params.finishing_speed) {
                        this.k[i] = 0;
                        this.pos[i] = this.finish[i];
                    }
                }
            });
            this.move();
            if (this.k[0] == 0 && this.k[1] == 0) {
                clearInterval(this.timer);
                this.timer = null;
                this.scrolling = false;
                this.params.scroll_complete_func?.({ x: this.pos[0], y: this.pos[1] });
            }
        }, 0);
    }

}